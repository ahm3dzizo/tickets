import requests
tests = [
    ("باب الكراج لا يفتح والريموت لا يستجيب", "garage_door"),
    ("ارضية الكراج فيها شقوق وتحتاج ترميم",   "structural"),
    ("العوامة عطلانة والخزان يفيض",             "pumps"),
    ("نافذة الالوميتال لا تغلق بشكل صحيح",     "doors_windows"),
    ("باب غرفة النوم الخشب لا يقفل",           "doors"),
    ("تسريب في الحمام بجانب النافذة",           "plumbing"),
]
for desc, expected in tests:
    r = requests.post("http://127.0.0.1:5050/classify", json={"description": desc})
    d = r.json()
    ok = "OK" if d["primaryType"] == expected else "!!"
    pct = int(d["confidence"] * 100)
    print(ok + " " + d["primaryType"].ljust(15) + str(pct) + "%  | " + desc[:40])
