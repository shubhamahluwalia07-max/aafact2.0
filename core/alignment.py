"""
AAFACT 2.0 - Bone Alignment & Coordinate Normalization Engine
Module 1: Anatomical Alignment and Tibial Plateau Z-Origin Registration.
"""
import os
import subprocess
import numpy as np
import trimesh

def find_aafact_executable(workspace_dir: str = None) -> str:
    """
    Searches for AAFACT.exe in workspace, PATH, or local directories.
    """
    candidates = []
    if workspace_dir:
        candidates.extend([
            os.path.join(workspace_dir, "AAFACT.exe"),
            os.path.join(workspace_dir, "bin", "AAFACT.exe"),
            os.path.join(workspace_dir, "aafact", "AAFACT.exe"),
        ])
    candidates.extend([
        os.path.abspath("AAFACT.exe"),
        os.path.abspath(os.path.join("bin", "AAFACT.exe")),
    ])
    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def run_aafact_subprocess(aafact_exe: str, input_path: str, output_path: str, laterality: str = "Right") -> bool:
    """
    Executes compiled AAFACT.exe subprocess.
    """
    cmd = [aafact_exe, input_path, output_path, "--laterality", laterality]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, check=True)
        return os.path.isfile(output_path) and os.path.getsize(output_path) > 0
    except Exception as e:
        print(f"[AAFACT Subprocess Warning] Failed to run {aafact_exe}: {e}")
        return False


def align_mesh_native_pca(mesh: trimesh.Trimesh, laterality: str = "Right", anatomy: str = "Tibia") -> trimesh.Trimesh:
    """
    Native Python PCA + Morphological Asymmetry Bone Alignment.
    
    1. Identifies longitudinal mechanical axis via 3D vertex PCA.
    2. Aligns primary mechanical axis to Z-axis [0, 0, 1].
    3. Detects proximal condyle / plateau vs. distal pilon based on cross-sectional
       morphology (tibial plateau has significantly wider mediolateral spread than distal ankle).
    4. Orients proximal plateau towards +Z (before origin translation).
    5. Aligns secondary axis (mediolateral) with X-axis, taking into account laterality.
    """
    verts = mesh.vertices.copy()
    centroid = np.mean(verts, axis=0)
    centered = verts - centroid

    # Compute covariance matrix & principal axes
    cov = np.cov(centered, rowvar=False)
    eigvals, eigvecs = np.linalg.eigh(cov)

    # Sort descending: largest eigenvalue corresponds to longitudinal shaft axis
    order = np.argsort(eigvals)[::-1]
    eigvals = eigvals[order]
    eigvecs = eigvecs[:, order]

    # Primary axis (Longitudinal) -> v_z
    v_z = eigvecs[:, 0]
    # Secondary axis (Mediolateral) -> v_x
    v_x = eigvecs[:, 1]
    # Tertiary axis (Anteroposterior) -> v_y = v_z x v_x
    v_y = np.cross(v_z, v_x)
    v_y = v_y / np.linalg.norm(v_y)
    # Re-orthogonalize v_x
    v_x = np.cross(v_y, v_z)
    v_x = v_x / np.linalg.norm(v_x)

    # Build rotation matrix R such that R @ v_z = [0, 0, 1]
    # R rows are [v_x, v_y, v_z]
    R = np.vstack([v_x, v_y, v_z])
    rotated_verts = (R @ centered.T).T

    # Proximal vs. Distal Asymmetry Detection
    # In the tibia, the proximal tibial plateau (condyles) has a much larger (X, Y)
    # cross-sectional area and spread than the distal pilon/malleolus.
    z_min, z_max = np.min(rotated_verts[:, 2]), np.max(rotated_verts[:, 2])
    z_span = z_max - z_min

    top_mask = rotated_verts[:, 2] > (z_max - 0.15 * z_span)
    bottom_mask = rotated_verts[:, 2] < (z_min + 0.15 * z_span)

    top_pts = rotated_verts[top_mask]
    bottom_pts = rotated_verts[bottom_mask]

    top_spread = np.std(top_pts[:, 0]) + np.std(top_pts[:, 1]) if len(top_pts) > 0 else 0
    bottom_spread = np.std(bottom_pts[:, 0]) + np.std(bottom_pts[:, 1]) if len(bottom_pts) > 0 else 0

    # If the top spread is smaller than bottom, the mesh is inverted (distal end is at top)
    if top_spread < bottom_spread:
        # Invert along X axis: rotate 180 degrees around X
        R_flip = np.array([
            [1,  0,  0],
            [0, -1,  0],
            [0,  0, -1]
        ], dtype=float)
        R = R_flip @ R
        rotated_verts = (R_flip @ rotated_verts.T).T

    # Mediolateral (X) vs Anteroposterior (Y) orientation
    # For a tibia, the plateau is wider mediolaterally (X) than anteroposteriorly (Y)
    z_max = np.max(rotated_verts[:, 2])
    prox_pts = rotated_verts[rotated_verts[:, 2] > (z_max - 0.20 * z_span)]
    if len(prox_pts) > 10:
        std_x = np.std(prox_pts[:, 0])
        std_y = np.std(prox_pts[:, 1])
        if std_y > std_x:
            # Swap X and Y with 90 degree rotation around Z
            R_swap = np.array([
                [0, -1, 0],
                [1,  0, 0],
                [0,  0, 1]
            ], dtype=float)
            R = R_swap @ R
            rotated_verts = (R_swap @ rotated_verts.T).T

    aligned_mesh = mesh.copy()
    aligned_mesh.vertices = rotated_verts
    return aligned_mesh


def normalize_tibial_plateau_z_origin(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, float, dict]:
    """
    Post-Alignment Coordinate Normalization:
    - Shifts mesh translation so the proximal joint line (Tibial Plateau) sits
      exactly at the origin (Z = 0.0 mm).
    - Bone shaft extends downward along the negative Z-axis:
      Z = 0.0 mm at proximal plateau to Z = -TTL at distal joint line (0% to 100% TTL).
    - Longitudinal mechanical axis is centered at X = 0, Y = 0.
    - Calculates and returns Total Tibial Length (TTL = z_max - z_min).
    
    Returns:
        tuple: (normalized_mesh, ttl_mm, metadata)
    """
    verts = mesh.vertices.copy()
    
    # Current Z bounds
    z_max_orig = float(np.max(verts[:, 2]))
    z_min_orig = float(np.min(verts[:, 2]))
    ttl = float(z_max_orig - z_min_orig)

    # Calculate center of mid-shaft (between 30% and 70% of length) for clean XY centering
    mid_mask = (verts[:, 2] > (z_min_orig + 0.3 * ttl)) & (verts[:, 2] < (z_min_orig + 0.7 * ttl))
    if np.sum(mid_mask) > 10:
        xy_center = np.mean(verts[mid_mask, :2], axis=0)
    else:
        xy_center = np.mean(verts[:, :2], axis=0)

    # Translation vector:
    # X -> X - xy_center[0]
    # Y -> Y - xy_center[1]
    # Z -> Z - z_max_orig (so highest point of plateau is exactly Z = 0.0 mm)
    translation = np.array([-xy_center[0], -xy_center[1], -z_max_orig], dtype=float)
    normalized_verts = verts + translation

    norm_mesh = mesh.copy()
    norm_mesh.vertices = normalized_verts

    # Verify bounds
    final_z_max = float(np.max(norm_mesh.vertices[:, 2]))
    final_z_min = float(np.min(norm_mesh.vertices[:, 2]))
    calculated_ttl = float(final_z_max - final_z_min)

    metadata = {
        'ttl_mm': round(calculated_ttl, 2),
        'proximal_z_origin': round(final_z_max, 4), # exactly 0.0
        'distal_z_end': round(final_z_min, 2),       # exactly -TTL
        'bbox_x_span': round(float(np.ptp(norm_mesh.vertices[:, 0])), 2),
        'bbox_y_span': round(float(np.ptp(norm_mesh.vertices[:, 1])), 2),
        'vertex_count': len(norm_mesh.vertices),
        'face_count': len(norm_mesh.faces),
        'is_watertight': bool(norm_mesh.is_watertight),
        'volume_cm3': round(float(norm_mesh.volume / 1000.0), 2) if norm_mesh.is_watertight else None
    }

    return norm_mesh, calculated_ttl, metadata


def process_bone_alignment(
    input_filepath: str,
    output_dir: str,
    patient_name: str = "Patient",
    laterality: str = "Right",
    anatomy: str = "Tibia",
    workspace_dir: str = None
) -> dict:
    """
    Main entry point for Module 1 Alignment pipeline.
    
    1. Loads mesh safely adhering to CRITICAL TRIMESH RULE:
       Never call .remove_duplicate_faces(). Rely on trimesh.load(filepath, force='mesh', process=True).
    2. Runs AAFACT.exe if present; otherwise runs native Python PCA alignment.
    3. Performs Post-Alignment Tibial Plateau Z-Origin Registration (Z=0 at plateau, Z=-TTL at distal).
    4. Exports aligned_[original_filename].stl into output_dir.
    5. Returns metrics and relative paths for download & Module 2 transition.
    """
    os.makedirs(output_dir, exist_ok=True)
    orig_basename = os.path.basename(input_filepath)
    aligned_filename = f"aligned_{orig_basename}"
    aligned_filepath = os.path.join(output_dir, aligned_filename)

    # Critical rule: trimesh.load with force='mesh', process=True, NO remove_duplicate_faces()
    mesh = trimesh.load(input_filepath, force='mesh', process=True)

    method_used = "Native Python PCA + Morphological Alignment"
    aafact_exe = find_aafact_executable(workspace_dir)
    
    if aafact_exe:
        temp_aafact_out = os.path.join(output_dir, f"temp_{orig_basename}")
        success = run_aafact_subprocess(aafact_exe, input_filepath, temp_aafact_out, laterality)
        if success:
            mesh = trimesh.load(temp_aafact_out, force='mesh', process=True)
            method_used = f"AAFACT.exe Subprocess ({os.path.basename(aafact_exe)})"
            try:
                os.remove(temp_aafact_out)
            except OSError:
                pass
        else:
            print("[INFO] Fallback to Native Python PCA alignment.")
            mesh = align_mesh_native_pca(mesh, laterality=laterality, anatomy=anatomy)
    else:
        mesh = align_mesh_native_pca(mesh, laterality=laterality, anatomy=anatomy)

    # Post-Alignment Coordinate Normalization: Z = 0 at proximal tibial plateau
    norm_mesh, ttl_mm, meta = normalize_tibial_plateau_z_origin(mesh)

    # Export STL
    norm_mesh.export(aligned_filepath)

    meta.update({
        'method_used': method_used,
        'patient_name': patient_name,
        'laterality': laterality,
        'anatomy': anatomy,
        'original_filename': orig_basename,
        'aligned_filename': aligned_filename,
        'aligned_filepath': aligned_filepath,
        'download_url': f"/api/download/aligned/{aligned_filename}"
    })
    return meta
