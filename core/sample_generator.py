"""
AAFACT 2.0 - Anatomical Sample Bone Generator
Generates realistic Tibia STLs for immediate testing & clinical validation:
- Ashok_Right_Tibia.stl
- Balvir_Left_Tibia.stl
"""
import os
import numpy as np
import trimesh

def generate_anatomical_tibia(laterality: str = "Right", length_mm: float = 370.0) -> trimesh.Trimesh:
    """
    Constructs an anatomically proportioned Tibia model with:
    - Proximal tibial plateau and condyles (Z near 0)
    - Triangular diaphysis shaft with anterior crest
    - Distal tibial pilon and medial malleolus (Z near -length_mm)
    """
    n_slices = 75
    n_pts_per_slice = 48
    theta = np.linspace(0, 2 * np.pi, n_pts_per_slice, endpoint=False)
    
    z_coords = np.linspace(0, -length_mm, n_slices)
    all_vertices = []
    
    # Mirroring factor for laterality: Right (+X is lateral, -X is medial), Left opposite
    lat_sign = 1.0 if laterality.lower().startswith('r') else -1.0
    
    for z in z_coords:
        t = -z / length_mm  # 0 at proximal plateau, 1 at distal pilon
        
        if t < 0.15:
            # Proximal Metaphysis / Plateau (flared condyles)
            flare = 1.0 - (t / 0.15)
            rx = 34.0 + 8.0 * flare  # Mediolateral semi-axis (~70-84mm wide)
            ry = 22.0 + 6.0 * flare  # Anteroposterior semi-axis (~44-56mm deep)
            
            # Subtle plateau dip/intercondylar eminence
            x = rx * np.cos(theta)
            y = ry * np.sin(theta)
            # Add posterior condylar notch
            y -= 4.0 * np.maximum(0, -np.sin(theta))**2 * flare
            
        elif t < 0.85:
            # Diaphysis / Shaft: transitions to triangular shape (anterior crest)
            shaft_t = (t - 0.15) / 0.70
            rx = 13.0 + 2.0 * np.cos(shaft_t * np.pi)
            ry = 14.0 + 2.0 * np.cos(shaft_t * np.pi)
            
            # Triangular profile: sharp anterior crest (+Y)
            r = rx * (1.0 + 0.25 * np.sin(theta) - 0.15 * np.cos(2 * theta))
            x = r * np.cos(theta)
            y = r * np.sin(theta)
            # Anterior tibial crest protrusion
            crest = np.maximum(0, np.sin(theta))**3
            y += 5.0 * crest
            
            # Slight physiological anterior and lateral bow
            y += 4.0 * np.sin(shaft_t * np.pi)
            x += lat_sign * 2.5 * np.sin(shaft_t * np.pi)
            
        else:
            # Distal Metaphysis / Pilon & Medial Malleolus
            dist_t = (t - 0.85) / 0.15
            rx = 15.0 + 7.0 * dist_t  # widens towards pilon (~40-44mm)
            ry = 14.0 + 4.0 * dist_t
            
            x = rx * np.cos(theta)
            y = ry * np.sin(theta)
            
            # Medial malleolus projection distally and medially (-X for Right, +X for Left)
            malleolus_effect = dist_t**2
            medial_mask = (-lat_sign * np.cos(theta)) > 0.3
            x[medial_mask] -= lat_sign * 6.0 * malleolus_effect
            
        # Apply laterality reflection
        x *= lat_sign
        
        slice_verts = np.column_stack([x, y, np.full(n_pts_per_slice, z)])
        all_vertices.append(slice_verts)
        
    all_vertices = np.vstack(all_vertices)
    
    # Construct quad mesh triangles between adjacent slices
    faces = []
    for s in range(n_slices - 1):
        for p in range(n_pts_per_slice):
            p_next = (p + 1) % n_pts_per_slice
            i0 = s * n_pts_per_slice + p
            i1 = s * n_pts_per_slice + p_next
            i2 = (s + 1) * n_pts_per_slice + p_next
            i3 = (s + 1) * n_pts_per_slice + p
            
            # Triangulate quad (i0, i1, i2, i3)
            faces.append([i0, i1, i2])
            faces.append([i0, i2, i3])
            
    # Cap proximal plateau (top slice at Z=0)
    top_center_idx = len(all_vertices)
    top_center = np.mean(all_vertices[:n_pts_per_slice], axis=0)
    all_vertices = np.vstack([all_vertices, top_center])
    for p in range(n_pts_per_slice):
        p_next = (p + 1) % n_pts_per_slice
        faces.append([top_center_idx, p, p_next])
        
    # Cap distal pilon (bottom slice at Z=-length)
    bottom_start = (n_slices - 1) * n_pts_per_slice
    bot_center_idx = len(all_vertices)
    bot_center = np.mean(all_vertices[bottom_start:bottom_start + n_pts_per_slice], axis=0)
    all_vertices = np.vstack([all_vertices, bot_center])
    for p in range(n_pts_per_slice):
        p_next = (p + 1) % n_pts_per_slice
        faces.append([bot_center_idx, bottom_start + p_next, bottom_start + p])
        
    mesh = trimesh.Trimesh(vertices=all_vertices, faces=faces, process=True)
    # Fix normals
    mesh.fix_normals()
    return mesh


def generate_all_sample_tibias(output_dir: str):
    """
    Creates standard sample STLs:
    - Ashok_Right_Tibia.stl (375 mm)
    - Balvir_Left_Tibia.stl (360 mm)
    """
    os.makedirs(output_dir, exist_ok=True)
    
    samples = [
        ("Ashok_Right_Tibia.stl", "Right", 375.0),
        ("Balvir_Left_Tibia.stl", "Left", 360.0),
    ]
    
    generated = []
    for fname, lat, length in samples:
        fpath = os.path.join(output_dir, fname)
        mesh = generate_anatomical_tibia(laterality=lat, length_mm=length)
        mesh.export(fpath)
        print(f"[Sample Generator] Created {fname} (Length: {length}mm, Watertight: {mesh.is_watertight}, Faces: {len(mesh.faces)})")
        generated.append(fpath)
        
    return generated


if __name__ == '__main__':
    target = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sample_data"))
    generate_all_sample_tibias(target)
