import urllib.request
import json
import io
from PIL import Image

def test_pipeline():
    img = Image.new('RGB', (224, 224), (34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, 'JPEG')
    boundary = 'b123'
    body = (
        b'--' + boundary.encode() + b'\r\n'
        b'Content-Disposition: form-data; name="file"; filename="leaf.jpg"\r\n'
        b'Content-Type: image/jpeg\r\n\r\n'
        + buf.getvalue() + b'\r\n'
        b'--' + boundary.encode() + b'--\r\n'
    )
    
    # 1. Test CNN
    req_cnn = urllib.request.Request(
        'https://agrovision-lsgn.onrender.com/api/cnn/predict',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST'
    )
    cnn_res = json.loads(urllib.request.urlopen(req_cnn).read().decode())
    print("1. CNN Predict Result:", cnn_res.get("prediction"))

    # 2. Test SNN
    snn_payload = {
        'soil_nitrogen': 280.0, 'soil_phosphorus': 13.5, 'soil_potassium': 122.4,
        'ndvi': 0.50, 'evi': 0.36, 'gndvi': 0.42, 'sif_740': 1.35, 'f687': 1.27, 'f760': 1.60,
        'fluorescence_ratio': 0.82, 'chlorophyll_content': 42.2, 'leaf_area_index': 2.52, 'light': 553.0,
        'temperature': 31.5, 'humidity': 65.0, 'soil_moisture': 0.62, 'rainfall': 0.0, 'aqi': 48.0, 'ozone': 0.035,
        'growth_stage': 'Flowering', 'days_since_sowing': 60, 'latitude': 20.975, 'longitude': 78.72,
        'observation_date': '2026-10-08'
    }
    req_snn = urllib.request.Request(
        'https://agrovision-lsgn.onrender.com/api/snn/predict',
        data=json.dumps(snn_payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    snn_res = json.loads(urllib.request.urlopen(req_snn).read().decode())
    print("2. SNN Predict Result:", snn_res.get("prediction"))

    # 3. Test Combine
    comb_payload = {
        'field_name': 'Field A',
        'visual_evidence': {
            'predicted_class': cnn_res['prediction']['class'],
            'confidence': cnn_res['prediction']['confidence'],
            'probabilities': cnn_res['probabilities']
        },
        'environmental_evidence': {
            'severity': snn_res['prediction']['class'],
            'confidence': snn_res['prediction']['confidence'],
            'spike_counts': snn_res['spike_counts'],
            'timesteps': 10
        },
        'environmental_inputs': {
            'temperature': 31.5, 'humidity': 65.0, 'soil_moisture': 0.62,
            'rainfall': 0.0, 'aqi': 48.0, 'ozone': 0.035, 'growth_stage': 'Flowering'
        }
    }
    req_comb = urllib.request.Request(
        'https://agrovision-lsgn.onrender.com/api/analysis/combine',
        data=json.dumps(comb_payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    comb_res = json.loads(urllib.request.urlopen(req_comb).read().decode())
    print("3. Combine Result Fusion:", comb_res.get('fusion'))
    print("4. Combine Result Final Assessment:", comb_res.get('final_assessment'))
    print("SUCCESS: End-to-end pipeline confirmed working!")

if __name__ == "__main__":
    test_pipeline()
