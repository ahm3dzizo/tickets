export type BiboCatalogSeed = {
  id: string;
  name: string;
  description: string;
  variants?: string;
  ranges?: Array<[number, number]>;
  imageIds?: number[];
};

export const BIBO_CATALOG_SEEDS: BiboCatalogSeed[] = [
  { id: "product-001", name: "بروشات ودبابيس أسماء عربية", description: "بروشات وأسماء عربية مخصصة بتصميمات معدنية متعددة.", variants: "ذهبي | فضي | تصميمات أسماء مختلفة", ranges: [[150689, 150692]] },
  { id: "product-002", name: "Baby Nest ومنتجات أطفال", description: "Baby nests ووسائد ومستلزمات أطفال بعدة نقوش وألوان.", variants: "ألوان ونقوش متعددة", ranges: [[150693, 150697]] },
  { id: "product-003", name: "مرايات وتجهيزات كتب كتاب وخطوبة", description: "مرايات وستاندات وصواني وتجهيزات مناسبات مخصصة.", variants: "أشكال مرايا وتجهيزات متعددة", ranges: [[150698, 150720]] },
  { id: "product-004", name: "مرايات مناسبات مخصصة", description: "مرايات مخصصة بالأسماء والتواريخ واللؤلؤ والزهور.", variants: "دائري | غير منتظم | لؤلؤ | زهور", ranges: [[150721, 150725]] },
  { id: "product-005", name: "أطقم مواليد مطرزة", description: "أطقم مواليد وملابس وبطاطين وإكسسوارات مطرزة بالأسماء.", variants: "أزرق | وردي | ذهبي | ثيمات متعددة", ranges: [[150726, 150747]] },
  { id: "product-006", name: "مناديل كتب كتاب مطرزة — المجموعة الأولى", description: "مناديل وأقمشة ساتان مطرزة بالأسماء والتواريخ والورود.", variants: "ورود | خرز | لؤلؤ | تطريزات مختلفة", ranges: [[150748, 150760]] },
  { id: "product-007", name: "مناديل كتب كتاب مطرزة — المجموعة الثانية", description: "استكمال مجموعة المناديل والأقمشة المطرزة للمناسبات.", variants: "فضي | أحمر | دانتيل | تطريز", ranges: [[150761, 150768]] },
  { id: "product-008", name: "Frames وعقد قران مع مناديل مطرزة", description: "Frames مخصصة وSets تجمع Frame مع مناديل أو أقمشة مطرزة.", variants: "وردي | أحمر | فضي", ranges: [[150769, 150777]] },
  { id: "product-009", name: "Jewelry Organizer Boxes", description: "علب ومنظمات مجوهرات مزينة بالأسماء والكريستال.", variants: "زخارف وأسماء متعددة", ranges: [[150781, 150784]] },
  { id: "product-010", name: "مراية يد مخصصة باللؤلؤ", description: "Hand mirror مخصصة مزينة باللؤلؤ والدانتيل والاسم.", imageIds: [150786] },
  { id: "product-011", name: "تجهيزات كتب الكتاب — المجموعة الكبيرة", description: "مناديل وFrames وSets وأقلام مناسبات بعدة تصميمات وزوايا.", variants: "وردي | أحمر | فضي | Sets متعددة", ranges: [[150788, 150815]] },
  { id: "product-012", name: "بوكيهات عروس", description: "بوكيهات عروس بيضاء بتصميمات ورد وكريستال متعددة.", variants: "ورد | Tulip | Calla | Crystal", ranges: [[150817, 150823]] },
  { id: "product-013", name: "مراوح عروس", description: "مراوح عروس من الدانتيل واللؤلؤ والكريستال والريش.", variants: "Lace | Pearl | Rhinestone | Feather", ranges: [[150825, 150832]] },
  { id: "product-014", name: "Pearl / Crystal Mini Bags", description: "شنط وإكسسوارات صغيرة مزينة باللؤلؤ أو الكريستال.", variants: "أبيض | وردي | أسود | زخارف حمراء", imageIds: [150834, 150835, 150836, 150837, 150839] },
  { id: "product-015", name: "مرآة دائرية مزخرفة", description: "مرآة دائرية بإطار خرز أو كريستال أحمر وكتابة مناسبة.", imageIds: [150838] },
  { id: "product-016", name: "أقلام عروس مزخرفة", description: "أقلام معدنية مزينة للمناسبات والأفراح.", imageIds: [150841, 150842] },
  { id: "product-017", name: "مظلة عروس دانتيل", description: "Bridal umbrella / parasol من الدانتيل الأبيض.", imageIds: [150843] },
  { id: "product-018", name: "BRIDE Headband / Veil", description: "Headband بحروف BRIDE مع نسخ لؤلؤ وكريستال وطرحة.", variants: "Headband | Veil", ranges: [[150844, 150846]] }
];
