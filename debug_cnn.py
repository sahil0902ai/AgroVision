import urllib.request
import urllib.error
import io
from PIL import Image

img = Image.new("RGB", (224, 224), color=(34, 139, 34))
buf = io.BytesIO()
img.save(buf, format="JPEG")
img_bytes = buf.getvalue()

boundary = "boundary123"
body = (
    b"--" + boundary.encode() + b"\r\n"
    b'Content-Disposition: form-data; name="file"; filename="cotton_leaf.jpg"\r\n'
    b"Content-Type: image/jpeg\r\n\r\n"
    + img_bytes + b"\r\n"
    b"--" + boundary.encode() + b"--\r\n"
)

req = urllib.request.Request(
    "https://agrovision-lsgn.onrender.com/api/cnn/predict",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print("Success:", resp.status, resp.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode())
except Exception as e:
    print("Exception:", e)
