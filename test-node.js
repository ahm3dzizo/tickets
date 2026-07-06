const apiKey = "sk-nry-Scw5jLgjKJNyedWQjRmeaoyU31LwzQdA5XzcpwS0pLA"; // ضع مفتاح الـ API هنا

const ticketText = `
السلام عليكم 
١- يوجد رطوبة بالجدار
٢- تشققات باماكن متفرقة 
٣- سور الحوش يحتاج صبغ
٤- باب الشارع غير ثابت بالأرض 
٥- فتحات الصيانة بدورة المياه ملتصقه بسبب الدهان و لم تركب بالشكل الصحيح
`;

async function testAPI() {
    console.log("⏳ جاري تحليل التذكرة، يرجى الانتظار...\n");

    try {
        const response = await fetch("https://router.bynara.id/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "mistral-large",
                messages: [
                    {
                        role: "system",
                        content: "أنت مساعد ذكي لخدمة العملاء. قم بتحليل نص التذكرة التالي واستخرج المعلومات المهمة (المشكلة الرئيسية، درجة الخطورة، وتصنيف المشكلة)."
                    },
                    { role: "user", content: ticketText }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ خطأ من الخادم:", data.error?.message || response.statusText);
            return;
        }

        console.log("✅ نتيجة التحليل:");
        console.log("===============================");
        console.log(data.choices[0].message.content);
        console.log("===============================");

    } catch (error) {
        console.error("❌ حدث خطأ في الاتصال:", error.message);
    }
}

if (apiKey === "YOUR_API_KEY_HERE") {
    console.log("⚠️ يرجى وضع الـ API Key الخاص بك في ملف test-node.js أولاً (السطر الأول).");
} else {
    testAPI();
}
