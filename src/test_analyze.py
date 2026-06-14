# test_analyze.py
import os
import shutil
from fastapi.testclient import TestClient

# 1. Start test client
from .app import app
client = TestClient(app)

print("--- PATH CONTROLS ---")
original_mp3 = "assets/audio/keyboard.mp3"
temp_m4a = "temp_keyboard_test.m4a"

if not os.path.exists(original_mp3):
    print(f"Error: {original_mp3} does not exist.")
    exit(1)

# Copy to .m4a to trigger conversion logic in main.py
shutil.copy(original_mp3, temp_m4a)
print(f"Copied {original_mp3} to {temp_m4a}")

try:
    print("\n--- TEST CALL STARTING ---")
    with open(temp_m4a, "rb") as f:
        response = client.post(
            "/analyze-speech/keyboard",
            files={"file": (temp_m4a, f, "audio/x-m4a")}
        )
    
    print("\n--- RESPONSE ---")
    print(f"Status Code: {response.status_code}")
    import json
    # Use ensure_ascii=True to prevent terminal encoding crashes under Windows console
    print(json.dumps(response.json(), indent=2, ensure_ascii=True))

except Exception as e:
    import sys
    import traceback
    print(f"Test Call Error: {e}")
    traceback.print_exc(file=sys.stdout)

finally:
    if os.path.exists(temp_m4a):
        os.remove(temp_m4a)
        print(f"\nRemoved temporary file {temp_m4a}")
