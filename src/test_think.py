import os
import shutil
from fastapi.testclient import TestClient
from .app import app

client = TestClient(app)

original_mp3 = "assets/audio/think.mp3"
temp_m4a = "temp_think_test.m4a"

if not os.path.exists(original_mp3):
    print(f"Error: {original_mp3} does not exist.")
    exit(1)

shutil.copy(original_mp3, temp_m4a)
print(f"Copied {original_mp3} to {temp_m4a}")

try:
    with open(temp_m4a, "rb") as f:
        response = client.post(
            "/analyze-speech/think",
            files={"file": (temp_m4a, f, "audio/x-m4a")}
        )
    
    print("Status Code:", response.status_code)
    import json
    print(json.dumps(response.json(), indent=2, ensure_ascii=True))

except Exception as e:
    print("Error:", e)
finally:
    if os.path.exists(temp_m4a):
        os.remove(temp_m4a)
