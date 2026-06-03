import requests
tests = [
    "يوجد شروخ في جدار غرفة النوم",
    "تشقق في الجدار الخارجي للفيلا",
    "صدع في الجدار مع تقشر دهان",
    "تقشر بوية الجدار مع شروخ صغيرة",
    "تشقق في الدهان فقط",
    "شروخ كبيرة في السقف والجدران",
    "انهيار جزئي في سور الحوش",
]
for d in tests:
    r = requests.post("http://127.0.0.1:5050/classify", json={"description": d}).json()
    t = r["primaryType"]
    c = int(r["confidence"]*100)
    print(t.ljust(15) + str(c) + "%  | " + d)
