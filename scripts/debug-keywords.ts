import { loadKeywordsFromDB, classifyFromKeywordsDB, normalizeArabic } from "../server/classifier/keywords.js";

async function run() {
  const keywords = await loadKeywordsFromDB();
  const desc1 = "صيانة باب قراج، تشحيم";
  const desc2 = "خزان الماء الأرضي ممتلىء ، ودينمو الماء لا يشتغل";
  const desc3 = "للمره الرابعة ارفع شكوى لوجود شكوى خروج روائح ولم تنتهي الريحة وهذا يأكد ان العيب انشائي وللاسف اني ";

  for (const desc of [desc1, desc2, desc3]) {
    console.log("----------------------");
    console.log("Desc:", desc);
    const norm = normalizeArabic(desc);
    console.log("Norm:", norm);
    for (const kw of keywords) {
      if (kw.keyword.includes(" ")) {
        if (norm.includes(kw.keyword)) console.log(`Matched phrase: '${kw.keyword}' -> ${kw.typeKey}`);
      } else {
        const regex = new RegExp(`(?:^|\\s)${kw.keyword}(?:\\s|$)`, "g");
        if (norm.match(regex)) {
          console.log(`Matched exact word: '${kw.keyword}' -> ${kw.typeKey}`);
        } else if (norm.includes(kw.keyword) && kw.keyword.length >= 6) {
          console.log(`Matched partial >=6: '${kw.keyword}' -> ${kw.typeKey}`);
        } else if (norm.includes(kw.keyword) && kw.keyword.length >= 4) {
          console.log(`Matched partial >=4: '${kw.keyword}' -> ${kw.typeKey}`);
        }
      }
    }
  }
}
run();
