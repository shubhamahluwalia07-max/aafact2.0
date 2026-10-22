"""
AAFACT 2.0 - Main Flask Web Application
Lead Python & 3D Geometry Engineer
"""
import os
import sys
import json
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from werkzeug.utils import secure_filename

# Import core modules
from core.parser import parse_bone_filename
from core.alignment import process_bone_alignment
from core.slicing import execute_corticotomy_slicing
from core.sample_generator import generate_all_sample_tibias
from check_matlab_runtime import is_matlab_runtime_v914_installed

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ALIGNED_DIR = os.path.join(BASE_DIR, "outputs", "aligned")
CUT_DIR = os.path.join(BASE_DIR, "outputs", "cut_segments")
SAMPLE_DIR = os.path.join(BASE_DIR, "sample_data")

for d in [UPLOAD_DIR, ALIGNED_DIR, CUT_DIR, SAMPLE_DIR]:
    os.makedirs(d, exist_ok=True)

# Generate sample files if not present
if not os.path.isfile(os.path.join(SAMPLE_DIR, "Ashok_Right_Tibia.stl")):
    generate_all_sample_tibias(SAMPLE_DIR)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config['MAX_CONTENT_LENGTH'] = 250 * 1024 * 1024  # 250 MB max upload
app.config['UPLOAD_FOLDER'] = UPLOAD_DIR


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/status', methods=['GET'])
def get_system_status():
    installed, details = is_matlab_runtime_v914_installed()
    return jsonify({
        'status': 'online',
        'matlab_runtime': details,
        'app_version': '2.0.0',
        'workspace': BASE_DIR
    })


@app.route('/api/samples', methods=['GET'])
def list_samples():
    samples = []
    if os.path.isdir(SAMPLE_DIR):
        for f in os.listdir(SAMPLE_DIR):
            if f.lower().endswith('.stl'):
                parsed = parse_bone_filename(f)
                file_path = os.path.join(SAMPLE_DIR, f)
                samples.append({
                    'filename': f,
                    'patient_name': parsed['patient_name'],
                    'laterality': parsed['laterality'],
                    'anatomy': parsed['anatomy'],
                    'size_kb': round(os.path.getsize(file_path) / 1024, 1),
                    'mesh_url': f"/api/mesh/sample/{f}"
                })
    return jsonify({'samples': samples})


@app.route('/api/samples/load', methods=['POST'])
def load_sample():
    data = request.get_json() or {}
    sample_filename = data.get('filename', 'Ashok_Right_Tibia.stl')
    src = os.path.join(SAMPLE_DIR, sample_filename)
    if not os.path.isfile(src):
        return jsonify({'error': f'Sample file {sample_filename} not found'}), 404

    dest = os.path.join(UPLOAD_DIR, sample_filename)
    import shutil
    shutil.copy2(src, dest)

    parsed = parse_bone_filename(sample_filename)
    return jsonify({
        'success': True,
        'filename': sample_filename,
        'patient_name': parsed['patient_name'],
        'laterality': parsed['laterality'],
        'anatomy': parsed['anatomy'],
        'is_standard': parsed['is_standard'],
        'size_kb': round(os.path.getsize(dest) / 1024, 1),
        'mesh_url': f"/api/mesh/upload/{sample_filename}"
    })


@app.route('/api/upload', methods=['POST'])
def upload_stls():
    """
    Accepts single or batch STL file uploads.
    Parses metadata via parse_bone_filename.
    """
    if 'files' not in request.files and 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    uploaded_files = request.files.getlist('files')
    if not uploaded_files or (len(uploaded_files) == 1 and uploaded_files[0].filename == ''):
        uploaded_files = [request.files['file']]

    results = []
    for f in uploaded_files:
        if not f or f.filename == '':
            continue
        original_name = f.filename
        if not original_name.lower().endswith('.stl'):
            continue

        clean_name = secure_filename(original_name)
        if not clean_name.lower().endswith('.stl'):
            clean_name += '.stl'
        save_path = os.path.join(UPLOAD_DIR, clean_name)
        f.save(save_path)

        parsed = parse_bone_filename(original_name)
        results.append({
            'filename': clean_name,
            'original_filename': original_name,
            'patient_name': parsed['patient_name'],
            'laterality': parsed['laterality'],
            'anatomy': parsed['anatomy'],
            'is_standard': parsed['is_standard'],
            'size_kb': round(os.path.getsize(save_path) / 1024, 1),
            'mesh_url': f"/api/mesh/upload/{clean_name}"
        })

    if not results:
        return jsonify({'error': 'No valid .stl files provided'}), 400

    return jsonify({'success': True, 'uploaded': results})


@app.route('/api/align', methods=['POST'])
def align_bone():
    """
    Module 1: Runs AAFACT alignment and Tibial Plateau Z-Origin registration.
    """
    data = request.get_json() or {}
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400

    input_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(input_path):
        # Also check sample_data as fallback
        alt_path = os.path.join(SAMPLE_DIR, filename)
        if os.path.isfile(alt_path):
            input_path = alt_path
        else:
            return jsonify({'error': f'File {filename} not found on server'}), 404

    patient_name = data.get('patient_name', 'Patient')
    laterality = data.get('laterality', 'Right')
    anatomy = data.get('anatomy', 'Tibia')

    try:
        res = process_bone_alignment(
            input_filepath=input_path,
            output_dir=ALIGNED_DIR,
            patient_name=patient_name,
            laterality=laterality,
            anatomy=anatomy,
            workspace_dir=BASE_DIR
        )
        res['mesh_url'] = f"/api/mesh/aligned/{res['aligned_filename']}"
        return jsonify({'success': True, 'data': res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Alignment failed: {str(e)}'}), 500


@app.route('/api/slice', methods=['POST'])
def slice_bone():
    """
    Module 2: Executes watertight corticotomy and defect slicing.
    """
    data = request.get_json() or {}
    aligned_filename = data.get('aligned_filename')
    if not aligned_filename:
        return jsonify({'error': 'aligned_filename is required'}), 400

    aligned_path = os.path.join(ALIGNED_DIR, aligned_filename)
    if not os.path.isfile(aligned_path):
        return jsonify({'error': f'Aligned mesh {aligned_filename} not found'}), 404

    try:
        ttl_mm = float(data.get('ttl_mm', 375.0))
        defect_start_pct = float(data.get('defect_start_pct', 20.0))
        defect_length_pct = float(data.get('defect_length_pct', 25.0))
        corticotomy_pct = float(data.get('corticotomy_pct', 75.0))
        saw_kerf_mm = float(data.get('saw_kerf_mm', 0.0))

        res = execute_corticotomy_slicing(
            aligned_stl_path=aligned_path,
            output_dir=CUT_DIR,
            ttl_mm=ttl_mm,
            defect_start_pct=defect_start_pct,
            defect_length_pct=defect_length_pct,
            corticotomy_pct=corticotomy_pct,
            saw_kerf_mm=saw_kerf_mm
        )

        # Add mesh URLs for 3D viewer
        for seg_key in ['proximal', 'transport', 'distal']:
            fn = res['segments'][seg_key]['filename']
            res['segments'][seg_key]['mesh_url'] = f"/api/mesh/cut_segments/{fn}"

        return jsonify({'success': True, 'data': res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Slicing failed: {str(e)}'}), 500


@app.route('/api/mesh/<folder>/<filename>')
def serve_mesh(folder, filename):
    """
    Serves STL mesh for Three.js STLLoader.
    """
    folder_map = {
        'upload': UPLOAD_DIR,
        'aligned': ALIGNED_DIR,
        'cut_segments': CUT_DIR,
        'sample': SAMPLE_DIR
    }
    target_dir = folder_map.get(folder)
    if not target_dir or not os.path.isfile(os.path.join(target_dir, filename)):
        return "Mesh not found", 404

    response = send_from_directory(target_dir, filename, mimetype='model/stl')
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


@app.route('/api/download/<folder>/<filename>')
def download_file(folder, filename):
    """
    Direct file download endpoint.
    """
    folder_map = {
        'aligned': ALIGNED_DIR,
        'cut_segments': CUT_DIR,
        'upload': UPLOAD_DIR,
        'sample': SAMPLE_DIR
    }
    target_dir = folder_map.get(folder)
    if not target_dir:
        return "Invalid folder", 400

    file_path = os.path.join(target_dir, filename)
    if not os.path.isfile(file_path):
        return "File not found", 404

    as_attachment = True
    mimetype = 'application/zip' if filename.endswith('.zip') else 'application/sla'
    return send_file(file_path, as_attachment=as_attachment, download_name=filename, mimetype=mimetype)


if __name__ == '__main__':
    print("[*] Starting AAFACT 2.0 Server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False)
