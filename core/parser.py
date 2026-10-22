"""
AAFACT 2.0 - Filename Parser
Extracts patient name, laterality, and anatomy from bone STL filenames.
"""
import re
import os

LATERALITY_PATTERNS = {
    'Right': [r'\bright\b', r'\brt\b', r'_r_', r'_r\b', r'\br_'],
    'Left': [r'\bleft\b', r'\blt\b', r'_l_', r'_l\b', r'\bl_'],
}

ANATOMY_PATTERNS = [
    'Tibia', 'Fibula', 'Femur', 'Talus', 'Patella', 
    'Humerus', 'Radius', 'Ulna', 'Pelvis', 'Calcaneus'
]

def parse_bone_filename(filename: str) -> dict:
    """
    Parses a bone STL filename (e.g., 'Ashok_Right_Tibia.stl' or 'Balvir_Left_Tibia.stl')
    into its components: patient_name, laterality, anatomy.
    
    Returns:
        dict: {
            'patient_name': str,
            'laterality': str ('Left' | 'Right' | 'Unknown'),
            'anatomy': str ('Tibia' | 'Fibula' | ... | 'Unknown'),
            'original_filename': str,
            'is_standard': bool
        }
    """
    base_name = os.path.splitext(os.path.basename(filename))[0]
    
    # Defaults
    patient_name = "Unknown_Patient"
    laterality = "Right"  # default clinical assumption for single limb
    anatomy = "Tibia"     # default primary bone
    is_standard = False
    
    # 1. Try strict standard regex: Name_Left/Right_AnatomyName
    # Example: Ashok_Right_Tibia, Balvir_Left_Tibia, John_Doe_Right_Femur
    std_match = re.match(r'^([A-Za-z0-9\s\-]+?)_(Left|Right|left|right)_(Tibia|Fibula|Femur|Talus|Patella|Humerus|Radius|Ulna|Pelvis|Calcaneus)$', base_name, re.IGNORECASE)
    if not std_match:
        # Also check with spaces or underscores inside patient name
        std_match = re.match(r'^(.*?)_(Left|Right)_(Tibia|Fibula|Femur|Talus|Patella|Humerus|Radius|Ulna|Pelvis|Calcaneus)$', base_name, re.IGNORECASE)
    
    if std_match:
        patient_name = std_match.group(1).strip().replace('_', ' ')
        lat_raw = std_match.group(2).capitalize()
        laterality = 'Left' if lat_raw.startswith('L') else 'Right'
        anat_raw = std_match.group(3).capitalize()
        for a in ANATOMY_PATTERNS:
            if a.lower() == anat_raw.lower():
                anatomy = a
                break
        return {
            'patient_name': patient_name,
            'laterality': laterality,
            'anatomy': anatomy,
            'original_filename': filename,
            'is_standard': True
        }
    
    # 2. Robust Token / Substring Matching for non-standard formats
    # Detect Anatomy
    detected_anatomy = None
    for anat in ANATOMY_PATTERNS:
        pattern = rf'(?i)\b{anat}\b|_{anat}_|^{anat}_|_{anat}$'
        if re.search(pattern, base_name):
            detected_anatomy = anat
            break
    if detected_anatomy:
        anatomy = detected_anatomy
        
    # Detect Laterality
    detected_lat = None
    # Check Left
    for p in LATERALITY_PATTERNS['Left']:
        if re.search(p, base_name, re.IGNORECASE):
            detected_lat = 'Left'
            break
    # Check Right
    if not detected_lat:
        for p in LATERALITY_PATTERNS['Right']:
            if re.search(p, base_name, re.IGNORECASE):
                detected_lat = 'Right'
                break
    if detected_lat:
        laterality = detected_lat
        
    # Extract Patient Name by removing anatomy and laterality tokens
    clean_name = base_name
    if detected_anatomy:
        clean_name = re.sub(rf'(?i)\b{detected_anatomy}\b|_{detected_anatomy}_|^{detected_anatomy}_|_{detected_anatomy}$', ' ', clean_name)
    # Remove laterality tokens
    clean_name = re.sub(r'(?i)\b(left|right|lt|rt)\b', ' ', clean_name)
    clean_name = re.sub(r'(?i)_(left|right|lt|rt)_', ' ', clean_name)
    clean_name = re.sub(r'(?i)_(left|right|lt|rt)$', ' ', clean_name)
    clean_name = re.sub(r'(?i)^(left|right|lt|rt)_', ' ', clean_name)
        
    # Clean up punctuation and whitespace
    clean_name = re.sub(r'[_\-\.\s]+', ' ', clean_name).strip()
    if clean_name:
        patient_name = clean_name.title()
    else:
        patient_name = base_name.replace('_', ' ').title()

    return {
        'patient_name': patient_name,
        'laterality': laterality,
        'anatomy': anatomy,
        'original_filename': filename,
        'is_standard': bool(detected_anatomy and detected_lat)
    }

if __name__ == '__main__':
    test_cases = [
        "Ashok_Right_Tibia.stl",
        "Balvir_Left_Tibia.stl",
        "John_Doe_Right_Femur.stl",
        "patient101_lt_tibia.stl",
        "right_tibia_reconstructed.stl",
        "scan_45_fibula_Left.stl",
        "Sample_Bone.stl"
    ]
    for tc in test_cases:
        res = parse_bone_filename(tc)
        print(f"File: {tc:30} -> Patient: {res['patient_name']:15} | Lat: {res['laterality']:5} | Anat: {res['anatomy']:7} | Std: {res['is_standard']}")
