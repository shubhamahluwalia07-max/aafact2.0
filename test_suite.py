import app

def test_full_workflow():
    client = app.app.test_client()

    print("[1] Loading sample Ashok_Right_Tibia.stl...")
    r1 = client.post('/api/samples/load', json={'filename': 'Ashok_Right_Tibia.stl'})
    assert r1.status_code == 200, f"Load failed: {r1.data}"
    j1 = r1.json
    print(f"    Success: patient={j1['patient_name']}, laterality={j1['laterality']}, anatomy={j1['anatomy']}")

    print("[2] Aligning bone & normalizing Tibial Plateau Z-origin...")
    r2 = client.post('/api/align', json={
        'filename': 'Ashok_Right_Tibia.stl',
        'patient_name': j1['patient_name'],
        'laterality': j1['laterality'],
        'anatomy': j1['anatomy']
    })
    assert r2.status_code == 200, f"Align failed: {r2.data}"
    j2 = r2.json['data']
    print(f"    Success: TTL={j2['ttl_mm']}mm, Plateau Z={j2['proximal_z_origin']}mm, Distal Z={j2['distal_z_end']}mm")
    assert j2['proximal_z_origin'] == 0.0, "Proximal Plateau must be at Z = 0.0 mm"
    assert j2['distal_z_end'] == -j2['ttl_mm'], "Distal joint must be at Z = -TTL mm"

    print("[3] Testing Corticotomy Preset A (25% defect at 20-45%, corticotomy at 75%)...")
    r3 = client.post('/api/slice', json={
        'aligned_filename': j2['aligned_filename'],
        'ttl_mm': j2['ttl_mm'],
        'defect_start_pct': 20.0,
        'defect_length_pct': 25.0,
        'corticotomy_pct': 75.0,
        'saw_kerf_mm': 0.5
    })
    assert r3.status_code == 200, f"Slice failed: {r3.data}"
    j3 = r3.json['data']
    print(f"    Ordering: {j3['ordering_mode']}")
    for k in ['proximal', 'transport', 'distal']:
        m = j3['segments'][k]['metrics']
        print(f"    Segment '{k}': {m['length_mm']} mm ({m['length_pct']}% TTL), watertight={m['is_watertight']}, vol={m['volume_cm3']} cm3")

    print("[4] Testing Corticotomy Preset B (Mid-shaft 20% defect at 40-60%, corticotomy at 20%)...")
    r4 = client.post('/api/slice', json={
        'aligned_filename': j2['aligned_filename'],
        'ttl_mm': j2['ttl_mm'],
        'defect_start_pct': 40.0,
        'defect_length_pct': 20.0,
        'corticotomy_pct': 20.0,
        'saw_kerf_mm': 0.0
    })
    assert r4.status_code == 200, f"Slice B failed: {r4.data}"
    j4 = r4.json['data']
    print(f"    Ordering: {j4['ordering_mode']}")
    for k in ['proximal', 'transport', 'distal']:
        m = j4['segments'][k]['metrics']
        print(f"    Segment '{k}': {m['length_mm']} mm ({m['length_pct']}% TTL), watertight={m['is_watertight']}, vol={m['volume_cm3']} cm3")

    print("[5] Testing STL file downloads...")
    r5 = client.get('/api/download/aligned/' + j2['aligned_filename'])
    assert r5.status_code == 200 and len(r5.data) > 0, "Aligned download failed"
    print(f"    Aligned STL download OK ({len(r5.data)} bytes)")

    r6 = client.get(j3['zip_archive']['download_url'])
    assert r6.status_code == 200 and len(r6.data) > 0, "ZIP download failed"
    print(f"    ZIP archive download OK ({len(r6.data)} bytes)")

    print("\n[ALL TESTS PASSED SUCCESSFULLY!]")

if __name__ == '__main__':
    test_full_workflow()
