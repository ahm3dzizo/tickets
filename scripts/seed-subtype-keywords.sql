-- SubType Keywords Seed
-- ══════════════════════════════════════════════════════

INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt") VALUES

-- plumbing: تسريبات مياه
(gen_random_uuid(),'تسريب مياه',NULL,'cmojp3kbe000cr4tozjq9toc6',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تسرب مياه',NULL,'cmojp3kbe000cr4tozjq9toc6',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'هريب ماء',NULL,'cmojp3kbe000cr4tozjq9toc6',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ماء نازل',NULL,'cmojp3kbe000cr4tozjq9toc6',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رشح مياه',NULL,'cmojp3kbe000cr4tozjq9toc6',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تقطير',NULL,'cmojp3kbe000cr4tozjq9toc6',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مياه نازلة',NULL,'cmojp3kbe000cr4tozjq9toc6',1.5,false,0,1.0,'seed',now(),now()),

-- plumbing: انسداد مجاري
(gen_random_uuid(),'انسداد مجاري',NULL,'cmojs5wbd001bdd6epofoqht3',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مجرى مسدود',NULL,'cmojs5wbd001bdd6epofoqht3',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'صرف مسدود',NULL,'cmojs5wbd001bdd6epofoqht3',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'سداد مجرى',NULL,'cmojs5wbd001bdd6epofoqht3',1.5,false,0,1.0,'seed',now(),now()),

-- plumbing: خزانات
(gen_random_uuid(),'خزان مكسور',NULL,'cmojp3kbb000ar4toxvy75w5q',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'كسر في الخزان',NULL,'cmojp3kbb000ar4toxvy75w5q',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'خزان أرضي',NULL,'cmojp3kbb000ar4toxvy75w5q',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'خزان علوي',NULL,'cmojp3kbb000ar4toxvy75w5q',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رقبة خزان',NULL,'cmojp3kbb000ar4toxvy75w5q',1.5,false,0,1.0,'seed',now(),now()),

-- plumbing: إصلاح خزان مياه
(gen_random_uuid(),'تغيير خزان',NULL,'cmojufxv0000ho72u44qjua3p',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'استبدال خزان',NULL,'cmojufxv0000ho72u44qjua3p',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'إصلاح خزان',NULL,'cmojufxv0000ho72u44qjua3p',1.5,false,0,1.0,'seed',now(),now()),

-- plumbing: مضخات
(gen_random_uuid(),'مضخة معطلة',NULL,'cmojp3kb80008r4to97jfwilm',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'موتور الماء',NULL,'cmojp3kb80008r4to97jfwilm',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'دينامو الماء',NULL,'cmojp3kb80008r4to97jfwilm',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ضخ الماء',NULL,'cmojp3kb80008r4to97jfwilm',1.5,false,0,1.0,'seed',now(),now()),

-- plumbing: صرف صحي
(gen_random_uuid(),'صرف صحي',NULL,'cmojp3kb40006r4toopzc8dbg',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'بيارة',NULL,'cmojp3kb40006r4toopzc8dbg',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'سيفون',NULL,'cmojp3kb40006r4toopzc8dbg',1.5,false,0,1.0,'seed',now(),now()),

-- electricity: إضاءة
(gen_random_uuid(),'لمبة',NULL,'cmojp3kbk000gr4to8ochh6q9',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'إضاءة',NULL,'cmojp3kbk000gr4to8ochh6q9',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'سبوت لايت',NULL,'cmojp3kbk000gr4to8ochh6q9',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مصباح',NULL,'cmojp3kbk000gr4to8ochh6q9',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'انارة',NULL,'cmojp3kbk000gr4to8ochh6q9',1.5,false,0,1.0,'seed',now(),now()),

-- electricity: قواطع وفيوزات
(gen_random_uuid(),'قاطع كهربائي',NULL,'cmojp3kca000ir4to8lybtq7p',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'فيوز',NULL,'cmojp3kca000ir4to8lybtq7p',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'لوحة كهربائية',NULL,'cmojp3kca000ir4to8lybtq7p',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'كهرباء تقطع',NULL,'cmojp3kca000ir4to8lybtq7p',1.5,false,0,1.0,'seed',now(),now()),

-- electricity: كاميرات وإنتركوم
(gen_random_uuid(),'كاميرا',NULL,'cmojp3kcf000mr4tobmrfawrh',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'انتركوم',NULL,'cmojp3kcf000mr4tobmrfawrh',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'جرس',NULL,'cmojp3kcf000mr4tobmrfawrh',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مسار التوصيل',NULL,'cmojp3kcf000mr4tobmrfawrh',1.5,false,0,1.0,'seed',now(),now()),

-- electricity: تمديدات
(gen_random_uuid(),'توصيل كهرباء',NULL,'cmojp3kcd000kr4toq14fm34w',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تمديد كهربائي',NULL,'cmojp3kcd000kr4toq14fm34w',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أسلاك',NULL,'cmojp3kcd000kr4toq14fm34w',1.5,false,0,1.0,'seed',now(),now()),

-- ceramics: تبليط أرضيات
(gen_random_uuid(),'بلاط أرضية',NULL,'cmojp3kd7001ar4toglxetmb9',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'سيراميك أرضية',NULL,'cmojp3kd7001ar4toglxetmb9',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تبليط أرضي',NULL,'cmojp3kd7001ar4toglxetmb9',2.0,false,0,1.0,'seed',now(),now()),

-- ceramics: تبليط جدران
(gen_random_uuid(),'بلاط جدار',NULL,'cmojp3kd9001cr4to8ng8lxfj',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'سيراميك جدران',NULL,'cmojp3kd9001cr4to8ng8lxfj',2.0,false,0,1.0,'seed',now(),now()),

-- ceramics: رخام
(gen_random_uuid(),'رخام مكسور',NULL,'cmojp3kdd001gr4to8lnn6ih3',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رخامة مكسورة',NULL,'cmojp3kdd001gr4to8lnn6ih3',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رخام مدخل',NULL,'cmojp3kdd001gr4to8lnn6ih3',1.5,false,0,1.0,'seed',now(),now()),

-- doors_windows: أبواب خشب
(gen_random_uuid(),'باب خشب',NULL,'cmojp3kcm000sr4toux2gnc10',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'باب داخلي',NULL,'cmojp3kcm000sr4toux2gnc10',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'باب لا يغلق',NULL,'cmojp3kcm000sr4toux2gnc10',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'باب غير موزون',NULL,'cmojp3kcm000sr4toux2gnc10',1.5,false,0,1.0,'seed',now(),now()),

-- doors_windows: جهاز باب الكراج
(gen_random_uuid(),'باب الكراج',NULL,'cmokl9kzf007b5yryvjyv6pdv',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ريموت الكراج',NULL,'cmokl9kzf007b5yryvjyv6pdv',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'جهاز الكراج',NULL,'cmokl9kzf007b5yryvjyv6pdv',2.0,false,0,1.0,'seed',now(),now()),

-- doors_windows: أبواب ألمنيوم
(gen_random_uuid(),'باب ألمنيوم',NULL,'cmojp3kck000qr4tom98v43yu',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'باب المنيوم',NULL,'cmojp3kck000qr4tom98v43yu',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'باب خارجي',NULL,'cmojp3kck000qr4tom98v43yu',1.5,false,0,1.0,'seed',now(),now()),

-- doors_windows: شبابيك
(gen_random_uuid(),'نافذة',NULL,'cmojp3kco000ur4toh0r9ilx8',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'شباك',NULL,'cmojp3kco000ur4toh0r9ilx8',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'زجاج نافذة',NULL,'cmojp3kco000ur4toh0r9ilx8',1.5,false,0,1.0,'seed',now(),now()),

-- doors_windows: أقفال
(gen_random_uuid(),'قفل باب',NULL,'cmojp3kcr000wr4tozze4w8b2',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مفتاح باب',NULL,'cmojp3kcr000wr4tozze4w8b2',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أقفال',NULL,'cmojp3kcr000wr4tozze4w8b2',2.0,false,0,1.0,'seed',now(),now()),

-- doors_windows: مقابض
(gen_random_uuid(),'مقبض باب',NULL,'cmojs4n290007dd6eu56inewg',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'يد باب',NULL,'cmojs4n290007dd6eu56inewg',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أيدي أبواب',NULL,'cmojs4n290007dd6eu56inewg',2.0,false,0,1.0,'seed',now(),now()),

-- cracks: تشققات جدران
(gen_random_uuid(),'تشقق جدار',NULL,'cmojp3kdl001kr4ton7o20mq2',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'شق في الجدار',NULL,'cmojp3kdl001kr4ton7o20mq2',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'صدع جدار',NULL,'cmojp3kdl001kr4ton7o20mq2',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تصدع جدار',NULL,'cmojp3kdl001kr4ton7o20mq2',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تشقق السور',NULL,'cmojp3kdl001kr4ton7o20mq2',1.5,false,0,1.0,'seed',now(),now()),

-- cracks: تشققات أسقف
(gen_random_uuid(),'تشقق السقف',NULL,'cmojp3kdn001mr4to4utw6tat',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'شق في السقف',NULL,'cmojp3kdn001mr4to4utw6tat',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'صدع السقف',NULL,'cmojp3kdn001mr4to4utw6tat',2.0,false,0,1.0,'seed',now(),now()),

-- cracks: هبوط أرضيات
(gen_random_uuid(),'هبوط أرضية',NULL,'cmojp3kdq001or4tojouijl1u',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أرضية هابطة',NULL,'cmojp3kdq001or4tojouijl1u',2.0,false,0,1.0,'seed',now(),now()),

-- paints: دهان داخلي
(gen_random_uuid(),'دهان داخلي',NULL,'cmojp3kcv0010r4toahxf170n',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'طلاء داخلي',NULL,'cmojp3kcv0010r4toahxf170n',1.5,false,0,1.0,'seed',now(),now()),

-- paints: دهان خارجي
(gen_random_uuid(),'دهان خارجي',NULL,'cmojp3kcx0012r4towg9zw2vc',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'دهان السور',NULL,'cmojp3kcx0012r4towg9zw2vc',1.5,false,0,1.0,'seed',now(),now()),

-- paints: تقشير وتلون
(gen_random_uuid(),'تقشر دهان',NULL,'cmojp3kd20016r4tof32etnod',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'تلون دهان',NULL,'cmojp3kd20016r4tof32etnod',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ألوان مختلفة',NULL,'cmojp3kd20016r4tof32etnod',1.5,false,0,1.0,'seed',now(),now()),

-- paints: معجون وجبس
(gen_random_uuid(),'معجون',NULL,'cmojp3kd00014r4toy8i1ghpl',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'جبس',NULL,'cmojp3kd00014r4toy8i1ghpl',2.0,false,0,1.0,'seed',now(),now()),

-- waterproofing: عزل أسطح
(gen_random_uuid(),'عزل سطح',NULL,'cmojp3kec0028r4tot7e3mj7u',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'عزل الأسطح',NULL,'cmojp3kec0028r4tot7e3mj7u',2.0,false,0,1.0,'seed',now(),now()),

-- waterproofing: رطوبة جدران
(gen_random_uuid(),'رطوبة جدران',NULL,'cmojp3keh002cr4tojeujryqh',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رطوبة',NULL,'cmojp3keh002cr4tojeujryqh',1.5,false,0,1.0,'seed',now(),now()),

-- waterproofing: تسربات أمطار
(gen_random_uuid(),'تسربات أمطار',NULL,'cmolnubo200db5yryjeqp4of6',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ماء المطر',NULL,'cmolnubo200db5yryjeqp4of6',1.5,false,0,1.0,'seed',now(),now()),

-- waterproofing: تسربات نوافذ
(gen_random_uuid(),'تسربات نوافذ',NULL,'cmok8fg2o00475yry0gz3vkiw',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مياه من النافذة',NULL,'cmok8fg2o00475yry0gz3vkiw',2.0,false,0,1.0,'seed',now(),now()),

-- waterproofing: عزل جدران خارجية
(gen_random_uuid(),'عزل جدران خارجية',NULL,'cmojp3kee002ar4toq0cyhv8k',2.0,false,0,1.0,'seed',now(),now()),

-- drainage: روائح كريهة
(gen_random_uuid(),'رائحة كريهة',NULL,'cmojp3ke30020r4tout2k88lk',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'رائحة مجاري',NULL,'cmojp3ke30020r4tout2k88lk',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'روائح',NULL,'cmojp3ke30020r4tout2k88lk',1.5,false,0,1.0,'seed',now(),now()),

-- drainage: انسداد مجاري
(gen_random_uuid(),'انسداد صرف',NULL,'cmojp3ke50022r4toyi6zgzro',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مجرى منسد',NULL,'cmojp3ke50022r4toyi6zgzro',2.0,false,0,1.0,'seed',now(),now()),

-- drainage: أغطية صرف
(gen_random_uuid(),'غطاء صرف',NULL,'cmojs66fp001xdd6ekpg5qf9s',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أغطية صرف',NULL,'cmojs66fp001xdd6ekpg5qf9s',2.0,false,0,1.0,'seed',now(),now()),

-- drainage: تسرب من الصرف
(gen_random_uuid(),'تسريب صرف',NULL,'cmojp3ke80024r4tort1okm2n',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مياه صرف',NULL,'cmojp3ke80024r4tort1okm2n',1.5,false,0,1.0,'seed',now(),now()),

-- grading: تجمع مياه
(gen_random_uuid(),'تجمع مياه',NULL,'cmojp3kf5002yr4towd8mhffp',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ماء يتجمع',NULL,'cmojp3kf5002yr4towd8mhffp',2.0,false,0,1.0,'seed',now(),now()),

-- grading: ميول خاطئ
(gen_random_uuid(),'ميول خاطئ',NULL,'cmojp3kf3002wr4togl8sb7ks',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ترويبة',NULL,'cmojp3kf3002wr4togl8sb7ks',1.5,false,0,1.0,'seed',now(),now()),

-- grading: هبوط أرض
(gen_random_uuid(),'هبوط أرض',NULL,'cmojp3kf70030r4tott09op7e',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'انخفاض الأرض',NULL,'cmojp3kf70030r4tott09op7e',1.5,false,0,1.0,'seed',now(),now()),

-- ac_ventilation: تكييف
(gen_random_uuid(),'تكييف',NULL,'cmojp3kel002gr4tonevoxptp',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مكيف',NULL,'cmojp3kel002gr4tonevoxptp',2.0,false,0,1.0,'seed',now(),now()),

-- ac_ventilation: تهوية
(gen_random_uuid(),'تهوية',NULL,'cmojp3keq002kr4toddeqz445',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'فتحة تهوية',NULL,'cmojp3keq002kr4toddeqz445',1.5,false,0,1.0,'seed',now(),now()),

-- ac_ventilation: مراوح شفط
(gen_random_uuid(),'مراوح شفط',NULL,'cmojp3keo002ir4toxljxwl6w',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'شفاط',NULL,'cmojp3keo002ir4toxljxwl6w',2.0,false,0,1.0,'seed',now(),now()),

-- pumps: مضخة مياه
(gen_random_uuid(),'مضخة مياه',NULL,'cmojp3keu002or4toq6to1gx5',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مضخة ماء',NULL,'cmojp3keu002or4toq6to1gx5',2.0,false,0,1.0,'seed',now(),now()),

-- pumps: عوامة
(gen_random_uuid(),'عوامة',NULL,'cmojp3kew002qr4toirgery17',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'عوامة الخزان',NULL,'cmojp3kew002qr4toirgery17',2.0,false,0,1.0,'seed',now(),now()),

-- pumps: تعبئة خزان
(gen_random_uuid(),'تعبئة خزان',NULL,'cmojp3kez002sr4tojldz0hqk',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ملء خزان',NULL,'cmojp3kez002sr4tojldz0hqk',1.5,false,0,1.0,'seed',now(),now()),

-- structural: أساسات
(gen_random_uuid(),'أساسات',NULL,'cmojp3kft003kr4tons70xxqr',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'أساس',NULL,'cmojp3kft003kr4tons70xxqr',2.0,false,0,1.0,'seed',now(),now()),

-- structural: جدران حاملة
(gen_random_uuid(),'جدار حامل',NULL,'cmojp3kfy003or4to3ic664g0',2.0,false,0,1.0,'seed',now(),now()),

-- tank_insulation: عزل خزان أرضي
(gen_random_uuid(),'عزل خزان أرضي',NULL,'cmojp3kdu001sr4tojmm15lyw',2.0,false,0,1.0,'seed',now(),now()),

-- tank_insulation: عزل خزان علوي
(gen_random_uuid(),'عزل خزان علوي',NULL,'cmojp3kdw001ur4to12wk18yl',2.0,false,0,1.0,'seed',now(),now()),

-- cleaning: تنظيف خزانات
(gen_random_uuid(),'تنظيف خزان',NULL,'cmojp3kfk003cr4tojmtjzu89',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'غسيل خزان',NULL,'cmojp3kfk003cr4tojmtjzu89',2.0,false,0,1.0,'seed',now(),now()),

-- cleaning: تنظيف عام
(gen_random_uuid(),'تنظيف عام',NULL,'cmojp3kfp003gr4tof9lyklzc',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'نظافة عامة',NULL,'cmojp3kfp003gr4tof9lyklzc',1.5,false,0,1.0,'seed',now(),now()),

-- cleaning: تنظيف مخلفات
(gen_random_uuid(),'تنظيف مخلفات',NULL,'cmojp3kfm003er4topgvur5dt',2.0,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'ازالة مخلفات',NULL,'cmojp3kfm003er4topgvur5dt',1.5,false,0,1.0,'seed',now(),now()),

-- pest_control: صراصير
(gen_random_uuid(),'صراصير',NULL,'cmojp3kfe0036r4to23mlw9pv',2.0,false,0,1.0,'seed',now(),now()),

-- pest_control: حشرات عام
(gen_random_uuid(),'حشرات',NULL,'cmojp3kfg0038r4touo4qkk56',1.5,false,0,1.0,'seed',now(),now()),
(gen_random_uuid(),'مكافحة حشرات',NULL,'cmojp3kfg0038r4touo4qkk56',2.0,false,0,1.0,'seed',now(),now()),

-- pest_control: نمل
(gen_random_uuid(),'نمل',NULL,'cmojp3kfb0034r4tonuro8i7d',2.0,false,0,1.0,'seed',now(),now())

ON CONFLICT DO NOTHING;

SELECT COUNT(*) as subtype_keywords_added FROM "TicketTypeKeyword" WHERE "subTypeId" IS NOT NULL;
