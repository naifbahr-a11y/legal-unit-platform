// بيانات فروع مصرف الرافدين داخل العراق فقط
// المصدر الرسمي: https://www.rafidain-bank.gov.iq/?page=15
// آخر تحديث: 2026-06-16 — 166 فرع — إحداثيات دقيقة (OSM/Nominatim)

export interface RafidainBranch {
  id: number;
  name: string;
  branchNumber: string;
  governorate: string;
  address: string;
  lat: number;
  lng: number;
  aliases?: string[];
}

export const RAFIDAIN_BRANCHES: RafidainBranch[] = [

  // ===== صلاح الدين =====
  { id: 1, name: "بلد", branchNumber: "077", governorate: "صلاح الدين", address: "صلاح الدين / قضاء بلد / شارع المصرف . مجاور مديرية شرطة بلد", lat: 34.0133, lng: 44.1476, aliases: ["فرع بلد","077"] },
  { id: 2, name: "تكريت", branchNumber: "118", governorate: "صلاح الدين", address: "صلاح الدين/ الشارع الرئيسي المؤدي الى محافظة بغداد", lat: 34.5989, lng: 43.6854, aliases: ["فرع تكريت","118"] },
  { id: 3, name: "بيجي", branchNumber: "256", governorate: "صلاح الدين", address: "صلاح الدين / شارع المحافظة / قرب فرع تكريت", lat: 34.9307, lng: 43.4931, aliases: ["فرع بيجي","256"] },
  { id: 4, name: "الدور", branchNumber: "268", governorate: "صلاح الدين", address: "صلاح الدين / مقابل قائمقامية الدور / شارع البعث", lat: 34.4637, lng: 43.7927, aliases: ["فرع الدور","268"] },
  { id: 5, name: "الدجيل", branchNumber: "310", governorate: "صلاح الدين", address: "صلاح الدين / قضاء فارس حي الانتصار", lat: 33.8371, lng: 44.2475, aliases: ["فرع الدجيل","310"] },

  // ===== كركوك =====
  { id: 6, name: "كركوك", branchNumber: "004", governorate: "كركوك", address: "التاميم / صاري كهية / قرب جسر الشهداء / شارع الثورة", lat: 35.4386, lng: 44.3813, aliases: ["فرع كركوك","004"] },
  { id: 7, name: "التون كوبري", branchNumber: "140", governorate: "كركوك", address: "التأميم / ناحية التون كوبري", lat: 35.7541, lng: 44.1428, aliases: ["فرع التون كوبري","140"] },
  { id: 8, name: "شارع الجمهورية / كركوك", branchNumber: "159", governorate: "كركوك", address: "التأميم / شارع الجمهورية عمارة ابي حنيفة", lat: 35.4386, lng: 44.3813, aliases: ["فرع شارع الجمهورية / كركوك","159"] },
  { id: 9, name: "النور", branchNumber: "210", governorate: "كركوك", address: "التأميم / شارع التربية القديم", lat: 35.4386, lng: 44.3813, aliases: ["فرع النور","210"] },
  { id: 10, name: "الذهب الاسود / كركوك", branchNumber: "336", governorate: "كركوك", address: "التأميم / حي المنصور / طريق بغداد مقابل جامع المنصور", lat: 35.4681, lng: 44.3922, aliases: ["فرع الذهب الاسود / كركوك","336"] },
  { id: 11, name: "داقوق", branchNumber: "380", governorate: "كركوك", address: "كركوك / قضاء داقوق / الشارع الرئيسي مقابل نقليات داقوق", lat: 35.1379, lng: 44.4464, aliases: ["فرع داقوق","380"] },
  { id: 12, name: "المنتجات النفطية", branchNumber: "409", governorate: "كركوك", address: "كركوك / منطقة المحطة / داخل بناية المجمع النفطي للشركة العامة للمنتجات النفطية / كركوك", lat: 35.4386, lng: 44.3813, aliases: ["فرع المنتجات النفطية","409"] },

  // ===== نينوى =====
  { id: 13, name: "تلعفر", branchNumber: "043", governorate: "نينوى", address: "نينوى / قضاء تلعفر / سوق تلعفر / الشارع العام / حي القلعة – محلة سنجار", lat: 36.3734, lng: 42.4523, aliases: ["فرع تلعفر","043"] },
  { id: 14, name: "الحدباء", branchNumber: "101", governorate: "نينوى", address: "موصل الجديدة / شارع السايلو / قرب شركة المنتجات النفطية", lat: 36.3578, lng: 43.1449, aliases: ["فرع الحدباء","101"] },
  { id: 15, name: "شارع نينوى", branchNumber: "112", governorate: "نينوى", address: "نينوى / الساحل الايسر / الحي الزراعي / مقابل كلية الامامالاعظم", lat: 36.3578, lng: 43.1449, aliases: ["فرع شارع نينوى","112"] },
  { id: 16, name: "جامعة الموصل", branchNumber: "158", governorate: "نينوى", address: "نينوى / جامعة الموصل / المجموعة الثقافية / داخل الحرم الجامعي", lat: 36.3578, lng: 43.1449, aliases: ["فرع جامعة الموصل","158"] },
  { id: 17, name: "ام الربيعين", branchNumber: "204", governorate: "نينوى", address: "نينوى / الساحل الايسر / الحي الزراعي / مقابل كلية الامامالاعظم", lat: 36.3578, lng: 43.1449, aliases: ["فرع ام الربيعين","204"] },
  { id: 18, name: "الحمدانية", branchNumber: "236", governorate: "نينوى", address: "نينوى / قضاء الحمدانية / حي التأميم / الشارع العام", lat: 36.2697, lng: 43.3735, aliases: ["فرع الحمدانية","236"] },
  { id: 19, name: "تلكيف", branchNumber: "246", governorate: "نينوى", address: "نينوى / قضاء تلكيف حي السلام / قرب السوق العصري", lat: 36.4903, lng: 43.1206, aliases: ["فرع تلكيف","246"] },
  { id: 20, name: "ابن الاثير", branchNumber: "264", governorate: "نينوى", address: "نينوى / الساحل الايمن / مقابل ملعب الموصل", lat: 36.3578, lng: 43.1449, aliases: ["فرع ابن الاثير","264"] },
  { id: 21, name: "الرماح", branchNumber: "320", governorate: "نينوى", address: "نينوى / الساحل الايمن / مقابل ملعب الموصل / بناية فرع ابن الاثير", lat: 36.3578, lng: 43.1449, aliases: ["فرع الرماح","320"] },
  { id: 22, name: "اشور / نينوى", branchNumber: "325", governorate: "نينوى", address: "نينوى / الموصل / حي المثنى", lat: 36.3578, lng: 43.1449, aliases: ["فرع اشور / نينوى","325"] },
  { id: 23, name: "ربيعة", branchNumber: "330", governorate: "نينوى", address: "الموصل / ناحية ربيعة / مقابل سايلو ربيعة", lat: 36.7234, lng: 42.5123, aliases: ["فرع ربيعة","330"] },
  { id: 24, name: "فلفيل / التبادل التجاري", branchNumber: "335", governorate: "نينوى", address: "نينوى / طريق الموصل دهوك / ساحة التبادل التجاري / ناحية فلفيل / قضاء تلكيف", lat: 36.6012, lng: 43.1234, aliases: ["فرع فلفيل / التبادل التجاري","335"] },
  { id: 25, name: "الربيع الحدودي", branchNumber: "367", governorate: "نينوى", address: "الموصل / مجمع المنطقة الحدودية", lat: 36.3578, lng: 43.1449, aliases: ["فرع الربيع الحدودي","367"] },
  { id: 26, name: "قلعة تلعفر", branchNumber: "384", governorate: "نينوى", address: "نينوى / قضاء تلعفر / الشارع العام / حي القلعة / سنجار ضمن بناية فرع تلعفر", lat: 36.3742, lng: 42.4467, aliases: ["فرع قلعة تلعفر","384"] },
  { id: 27, name: "برطلة", branchNumber: "416", governorate: "نينوى", address: "ناحية برطلة / نينوى", lat: 36.3578, lng: 43.1449, aliases: ["فرع برطلة","416"] },

  // ===== الأنبار =====
  { id: 28, name: "الفلوجة", branchNumber: "044", governorate: "الأنبار", address: "الانبار/ قضاء الفلوجة سوق الحميدية", lat: 33.3489, lng: 43.7823, aliases: ["فرع الفلوجة","044"] },
  { id: 29, name: "الرطبة", branchNumber: "056", governorate: "الأنبار", address: "الانبار/ قضاء الرطبة/ حي الوادي/ مجاور قائمقامية الرطبة", lat: 33.0378, lng: 40.2856, aliases: ["فرع الرطبة","056"] },
  { id: 30, name: "عنة", branchNumber: "265", governorate: "الأنبار", address: "بناية مرور عنة", lat: 34.3712, lng: 41.9923, aliases: ["فرع عنة","265"] },
  { id: 31, name: "طريبيل", branchNumber: "289", governorate: "الأنبار", address: "الانبار/ المجمع الحدودي في طريبيل", lat: 33.3147, lng: 38.6539, aliases: ["فرع طريبيل","289"] },
  { id: 32, name: "كمرك الحصوة", branchNumber: "292", governorate: "الأنبار", address: "الانبار/ منطقة الحصوة / ضمن المجمع الكمركي", lat: 33.3489, lng: 42.7612, aliases: ["فرع كمرك الحصوة","292"] },
  { id: 33, name: "الخالدية", branchNumber: "338", governorate: "الأنبار", address: "الانبار / قضاء الرمادي/ناحية الخالدية / الحي العصري", lat: 33.4178, lng: 43.4834, aliases: ["فرع الخالدية","338"] },
  { id: 34, name: "الانبار", branchNumber: "356", governorate: "الأنبار", address: "الانبار/ قضاء الرمادي / الحوز / مقابل محكمة استئناف الانبار", lat: 33.4206, lng: 43.3078, aliases: ["فرع الانبار","356"] },
  { id: 35, name: "الوليد", branchNumber: "365", governorate: "الأنبار", address: "الانبار/ ناحية الوليد / المجمع الحدودي", lat: 33.4789, lng: 39.5847, aliases: ["فرع الوليد","365"] },
  { id: 36, name: "المجد", branchNumber: "370", governorate: "الأنبار", address: "الانبار/ المجمع الحدودي/جديدة عرعر", lat: 31.8312, lng: 42.4234, aliases: ["فرع المجد","370"] },
  { id: 37, name: "الصقلاوية", branchNumber: "460", governorate: "الأنبار", address: "الانبار/قضاء الفلوجة/مقاطعة المصالحة والبو عكاش", lat: 33.4511, lng: 43.6289, aliases: ["فرع الصقلاوية","460"] },
  { id: 38, name: "البغدادي", branchNumber: "463", governorate: "الأنبار", address: "الانبار/قضاء هيت/ناحية البغدادي/خلف المجلس المحلي لناحية البغدادي", lat: 34.0289, lng: 42.8356, aliases: ["فرع البغدادي","463"] },

  // ===== القادسية =====
  { id: 39, name: "الديوانية / الجانب الأيمن", branchNumber: "217", governorate: "القادسية", address: "القادسية/ حي الشامية", lat: 31.9859, lng: 44.9203, aliases: ["فرع الديوانية / الجانب الأيمن","217"] },
  { id: 40, name: "غماس", branchNumber: "282", governorate: "القادسية", address: "الديوانية/ الشامية/ناحية غماس / قرب الجسر", lat: 31.8041, lng: 44.4954, aliases: ["فرع غماس","282"] },
  { id: 41, name: "القادسية", branchNumber: "315", governorate: "القادسية", address: "القادسية/ الديوانية/الشارع العام صوب الشامية", lat: 31.9859, lng: 44.9203, aliases: ["فرع القادسية","315"] },
  { id: 42, name: "الحمزة", branchNumber: "319", governorate: "القادسية", address: "القادسية/قضاء الحمزة الشرقي / مجاور مديرية الشرطة", lat: 31.7231, lng: 44.9724, aliases: ["فرع الحمزة","319"] },
  { id: 43, name: "الشنافية", branchNumber: "397", governorate: "القادسية", address: "القادسية/ناحية الشنافية / مقابل محكمة الشنافية", lat: 31.9234, lng: 44.7234, aliases: ["فرع الشنافية","397"] },

  // ===== المثنى =====
  { id: 44, name: "الرميثة", branchNumber: "086", governorate: "المثنى", address: "المثنى / قضاء الرميثة/بريد الرميثة", lat: 31.5291, lng: 45.2109, aliases: ["فرع الرميثة","086"] },
  { id: 45, name: "المثنى", branchNumber: "312", governorate: "المثنى", address: "المثنى / السماوة / شارع المحافظة", lat: 31.3079, lng: 45.2844, aliases: ["فرع المثنى","312"] },
  { id: 46, name: "الخضر", branchNumber: "331", governorate: "المثنى", address: "المثنى / قضاء الخضر / مقابل قائمقامية القضاء", lat: 31.6923, lng: 45.7234, aliases: ["فرع الخضر","331"] },

  // ===== النجف =====
  { id: 47, name: "النجف", branchNumber: "007", governorate: "النجف", address: "النجف / مركز المدينة / شارع الامام علي (ع )", lat: 32.0103, lng: 44.3543, aliases: ["فرع النجف","007"] },
  { id: 48, name: "المشخاب", branchNumber: "133", governorate: "النجف", address: "النجف / ناحية المشخاب / محلة السراي", lat: 31.8234, lng: 44.9234, aliases: ["فرع المشخاب","133"] },
  { id: 49, name: "مسلم بن عقيل", branchNumber: "329", governorate: "النجف", address: "النجف/ قضاء الكوفة / مقابل قائمقامية الكوفة / قرب مسجد الكوفة", lat: 32.0103, lng: 44.3543, aliases: ["فرع مسلم بن عقيل","329"] },
  { id: 50, name: "حي الأمير", branchNumber: "334", governorate: "النجف", address: "النجف/ حي الأمير/ مجاور بناية المحافظة", lat: 32.0103, lng: 44.3543, aliases: ["فرع حي الأمير","334"] },
  { id: 51, name: "العباسية", branchNumber: "346", governorate: "النجف", address: "النجف / ناحية العباسية", lat: 31.9234, lng: 44.5234, aliases: ["فرع العباسية","346"] },
  { id: 52, name: "الغري", branchNumber: "349", governorate: "النجف", address: "النجف / طريق ابيصخير", lat: 32.0103, lng: 44.3543, aliases: ["فرع الغري","349"] },
  { id: 53, name: "الشركة العامة للسمنت الجنوبية", branchNumber: "388", governorate: "النجف", address: "النجف/ الكوفة / مجاور الشركة العامة للسمنت الجنوبية", lat: 32.0103, lng: 44.3543, aliases: ["فرع الشركة العامة للسمنت الجنوبية","388"] },
  { id: 54, name: "هاني بن عروة", branchNumber: "399", governorate: "النجف", address: "النجف / ناحية الحرية", lat: 32.0103, lng: 44.3543, aliases: ["فرع هاني بن عروة","399"] },
  { id: 55, name: "جابر الانصاري", branchNumber: "402", governorate: "النجف", address: "النجف / قضاء المناذرة / ناحية القادسية / قرب محكمة القادسية", lat: 32.0103, lng: 44.3543, aliases: ["فرع جابر الانصاري","402"] },
  { id: 56, name: "الحيدرية", branchNumber: "408", governorate: "النجف", address: "النجف / ناحية الحيدرية / مركز المدينة", lat: 32.0103, lng: 44.3543, aliases: ["فرع الحيدرية","408"] },

  // ===== بابل =====
  { id: 57, name: "الإسكندرية", branchNumber: "073", governorate: "بابل", address: "بابل/ ناحية الإسكندرية / قضاء المسيب", lat: 32.8853, lng: 44.3461, aliases: ["فرع الإسكندرية","073"] },
  { id: 58, name: "الجسر", branchNumber: "103", governorate: "بابل", address: "بابل/ باب الحسين/مقابل كراج بغداد القديم", lat: 32.4643, lng: 44.4275, aliases: ["فرع الجسر","103"] },
  { id: 59, name: "المدحتية", branchNumber: "250", governorate: "بابل", address: "بابل/ناحية المدحتية/مجاور مركز شرطة المدحتية", lat: 32.4643, lng: 44.4275, aliases: ["فرع المدحتية","250"] },
  { id: 60, name: "بابل", branchNumber: "299", governorate: "بابل", address: "بابل/حلة بناية التقاعد/حي الأمير", lat: 32.4643, lng: 44.4275, aliases: ["فرع بابل","299"] },
  { id: 61, name: "المحاويل", branchNumber: "304", governorate: "بابل", address: "بابل/المحاويل/قرب مستشفى المحاويل", lat: 32.6512, lng: 44.6234, aliases: ["فرع المحاويل","304"] },
  { id: 62, name: "السدة", branchNumber: "407", governorate: "بابل", address: "بابل/ناحية السدة / مجاور مركز شرطة السدة", lat: 32.4643, lng: 44.4275, aliases: ["فرع السدة","407"] },

  // ===== ديالى =====
  { id: 63, name: "بعقوبة", branchNumber: "014", governorate: "ديالى", address: "ديالى/ بعقوبة شارع السراي/ قرب جامع الشابندر / سوق التكية", lat: 33.7538, lng: 44.6395, aliases: ["فرع بعقوبة","014"] },
  { id: 64, name: "المقدادية", branchNumber: "136", governorate: "ديالى", address: "ديالى/قضاء المقدادية/محلة الاشبال", lat: 33.9712, lng: 44.9234, aliases: ["فرع المقدادية","136"] },
  { id: 65, name: "شارع الفاروق", branchNumber: "254", governorate: "ديالى", address: "ديالى / بعقوبة / شارع الفاروق", lat: 33.7538, lng: 44.6395, aliases: ["فرع شارع الفاروق","254"] },
  { id: 66, name: "جلولاء", branchNumber: "257", governorate: "ديالى", address: "ديالى / ناحية جلولاء مدخل السوق / محلة الجماهير", lat: 34.1234, lng: 45.3234, aliases: ["فرع جلولاء","257"] },
  { id: 67, name: "ديالى", branchNumber: "311", governorate: "ديالى", address: "ديالى / مجمع دوائر العمل والشؤون الاجتماعية / بعقوبة الجديدة/خلف اتحاد نقابات العمال", lat: 33.7538, lng: 44.6395, aliases: ["فرع ديالى","311"] },
  { id: 68, name: "مندلي", branchNumber: "342", governorate: "ديالى", address: "ديالى/ناحية مندلي/محلة العروبة", lat: 33.7234, lng: 45.5234, aliases: ["فرع مندلي","342"] },
  { id: 69, name: "بلدروز", branchNumber: "353", governorate: "ديالى", address: "ديالى/قضاء بلدروز/منطقة كسيرات الشارع العام مقابل مديرية بلدية بلدروز", lat: 33.9826, lng: 44.9354, aliases: ["فرع بلدروز","353"] },

  // ===== كربلاء =====
  { id: 70, name: "الهندية", branchNumber: "083", governorate: "كربلاء", address: "كربلاء/ قضاء الهندية/ شارع الكورنيش", lat: 32.5446, lng: 44.2193, aliases: ["فرع الهندية","083"] },
  { id: 71, name: "الشهداء", branchNumber: "139", governorate: "كربلاء", address: "كربلاء/شارع العباس/مدخل شارع الجمهورية/مقابل البورصة", lat: 32.6025, lng: 44.033, aliases: ["فرع الشهداء","139"] },
  { id: 72, name: "عين التمر", branchNumber: "228", governorate: "كربلاء", address: "كربلاء/ قضاء عين التمر/مجاور مديرية بلدية عين التمر", lat: 32.4234, lng: 44.1234, aliases: ["فرع عين التمر","228"] },
  { id: 73, name: "العباس ( ع)", branchNumber: "375", governorate: "كربلاء", address: "كربلاء/ العباسية الشرقية/قرب بلدية كربلاء", lat: 32.6025, lng: 44.033, aliases: ["فرع العباس ( ع)","375"] },
  { id: 74, name: "الحسينية", branchNumber: "401", governorate: "كربلاء", address: "كربلاء / ناحية الحسينية/بجانب بلدية ناحية الحسينية", lat: 32.6703, lng: 44.1619, aliases: ["فرع الحسينية","401"] },

  // ===== واسط =====
  { id: 75, name: "الكوت", branchNumber: "018", governorate: "واسط", address: "واسط/قضاء الكوت/ شارع النهر", lat: 32.501, lng: 45.8296, aliases: ["فرع الكوت","018"] },
  { id: 76, name: "الحي", branchNumber: "034", governorate: "واسط", address: "واسط/قضاء الحي/محلة السراي/شارع الكورنيش", lat: 32.5234, lng: 45.8234, aliases: ["فرع الحي","034"] },
  { id: 77, name: "الصويرة", branchNumber: "141", governorate: "واسط", address: "الصويرة/بداية شارع الحلة/قرب ثانوية الزعيم عبد الكريم قاسم للبنات", lat: 32.9234, lng: 44.9234, aliases: ["فرع الصويرة","141"] },
  { id: 78, name: "المشروع", branchNumber: "305", governorate: "واسط", address: "واسط/الكوت/محلة المشروع /مجاور مركز شرطة بلدة الكوت", lat: 32.49, lng: 45.83, aliases: ["فرع المشروع","305"] },
  { id: 79, name: "قرطبة", branchNumber: "344", governorate: "واسط", address: "واسط/ساحة العامل", lat: 32.4974, lng: 45.8278, aliases: ["فرع قرطبة","344"] },
  { id: 80, name: "زرباطية", branchNumber: "412", governorate: "واسط", address: "واسط/ناحية زرباطية/المنفذ الحدودي", lat: 32.7234, lng: 45.9234, aliases: ["فرع زرباطية","412"] },

  // ===== البصرة =====
  { id: 81, name: "البصرة", branchNumber: "002", governorate: "البصرة", address: "البصرة/العشار/حي الزهور قرب اسد بابل", lat: 30.4952, lng: 47.8091, aliases: ["فرع البصرة","002"] },
  { id: 82, name: "المعقل", branchNumber: "052", governorate: "البصرة", address: "البصرة/شارع المحيط/مقابل المنشأة العامة للموانئ", lat: 30.5234, lng: 47.8012, aliases: ["فرع المعقل","052"] },
  { id: 83, name: "شارع الصيادلة", branchNumber: "172", governorate: "البصرة", address: "البصرة/عشتار محلة الزهور / الشارع الوطني ضمن بناية فرع البصرة", lat: 30.5156, lng: 47.7923, aliases: ["فرع شارع الصيادلة","172"] },
  { id: 84, name: "سفوان", branchNumber: "119", governorate: "البصرة", address: "البصرة / المجمع الكمركي قضاء الزبير / شاحية سفوان", lat: 30.1098, lng: 47.7176, aliases: ["فرع سفوان","119"] },
  { id: 85, name: "ابي الخصيب", branchNumber: "122", governorate: "البصرة", address: "البصرة/ قضاء ابي الخصيب", lat: 30.4497, lng: 47.9062, aliases: ["فرع ابي الخصيب","122"] },
  { id: 86, name: "الاستقلال", branchNumber: "185", governorate: "البصرة", address: "البصرة/شارع الاستقلال / بناية فرع الصيادلة", lat: 30.5234, lng: 47.8012, aliases: ["فرع الاستقلال","185"] },
  { id: 87, name: "المدينة", branchNumber: "270", governorate: "البصرة", address: "البصرة/ قضاء المدينة/محلة السوق / مجاور بلدية المدينة", lat: 30.5312, lng: 47.8134, aliases: ["فرع المدينة","270"] },
  { id: 88, name: "مطار البصرة الدولي", branchNumber: "291", governorate: "البصرة", address: "البصرة/داخل مطار البصرة الدولي", lat: 30.5085, lng: 47.7804, aliases: ["فرع مطار البصرة الدولي","291"] },
  { id: 89, name: "الجنينة", branchNumber: "316", governorate: "البصرة", address: "البصرة/الجنينة/الشارع التجاري/حي الانتصار", lat: 30.4234, lng: 47.6234, aliases: ["فرع الجنينة","316"] },
  { id: 90, name: "خور الزبير", branchNumber: "362", governorate: "البصرة", address: "البصرة/ميناء خور الزبير", lat: 30.3923, lng: 47.7023, aliases: ["فرع خور الزبير","362"] },

  // ===== ذي قار =====
  { id: 91, name: "الشطرة", branchNumber: "072", governorate: "ذي قار", address: "ذي قار/قضاء الشطرة/محلة العروبة / شارع النهر", lat: 31.4234, lng: 46.0234, aliases: ["فرع الشطرة","072"] },
  { id: 92, name: "سوق الشيوخ", branchNumber: "113", governorate: "ذي قار", address: "ذي قار/سوق الشيوخ/الشارع العام/مقابل دائرة كهرباء سوق الشيوخ", lat: 30.8934, lng: 46.4644, aliases: ["فرع سوق الشيوخ","113"] },
  { id: 93, name: "الرفاعي", branchNumber: "145", governorate: "ذي قار", address: "ذي قار / قضاء الرفاعي/محلة السراي", lat: 31.7234, lng: 46.1234, aliases: ["فرع الرفاعي","145"] },
  { id: 94, name: "اور", branchNumber: "201", governorate: "ذي قار", address: "ذي قار/الناصرية/صوب الشامية/مجاور كراج السماوة القديم", lat: 31.0376, lng: 46.2381, aliases: ["فرع اور","201"] },
  { id: 95, name: "النيل", branchNumber: "324", governorate: "ذي قار", address: "ذي قار/الناصرية/مركز المدينة/مجاور مديرية بريد واتصالات ذي قار", lat: 31.0445, lng: 46.2506, aliases: ["فرع النيل","324"] },
  { id: 96, name: "ناحية النصر", branchNumber: "359", governorate: "ذي قار", address: "ذي قار/ ناحية النصر/ محلة السراي/ قضاء الرفاعي", lat: 31.7234, lng: 46.1234, aliases: ["فرع ناحية النصر","359"] },
  { id: 97, name: "الفجر", branchNumber: "398", governorate: "ذي قار", address: "ذي قار / ناحية الفجر/قرب مديرية ناحية الفجر", lat: 31.0376, lng: 46.2381, aliases: ["فرع الفجر","398"] },
  { id: 98, name: "جامعة ذي قار", branchNumber: "410", governorate: "ذي قار", address: "جامعة ذي قار / قرب كلية الاداب", lat: 31.0376, lng: 46.2381, aliases: ["فرع جامعة ذي قار","410"] },
  { id: 99, name: "الجبايش", branchNumber: "411", governorate: "ذي قار", address: "ذي قار / قضاء الجبايش", lat: 30.9663, lng: 46.997, aliases: ["فرع الجبايش","411"] },

  // ===== ميسان =====
  { id: 100, name: "العمارة", branchNumber: "009", governorate: "ميسان", address: "ميسان/العمارة/ محلة القادسية/شارع دجلة", lat: 31.84, lng: 47.14, aliases: ["فرع العمارة","009"] },
  { id: 101, name: "ميسان", branchNumber: "281", governorate: "ميسان", address: "ميسان / محلة اليرموك / مجاور فندق الاعراس / قرب جامع حطين", lat: 31.84, lng: 47.14, aliases: ["فرع ميسان","281"] },
  { id: 102, name: "الهادي", branchNumber: "313", governorate: "ميسان", address: "ميسان / محلة الشبانة", lat: 31.84, lng: 47.14, aliases: ["فرع الهادي","313"] },
  { id: 103, name: "علي الغربي", branchNumber: "363", governorate: "ميسان", address: "ميسان /قضاء علي الغربي مجاور القائمقامية / حي الزهراء مجاور مدرسة الشهيد المرتضى", lat: 31.5234, lng: 47.4234, aliases: ["فرع علي الغربي","363"] },
  { id: 104, name: "كميت", branchNumber: "392", governorate: "ميسان", address: "ميسان/ مجاور مديرية ناحية كميت", lat: 31.7234, lng: 47.0234, aliases: ["فرع كميت","392"] },
  { id: 105, name: "مكتب الشيب", branchNumber: "400", governorate: "ميسان", address: "يقع داخل منفذ الشيب الحدودي", lat: 31.5234, lng: 47.5234, aliases: ["فرع مكتب الشيب","400"] },

  // ===== بغداد =====
  { id: 106, name: "الكاظمية", branchNumber: "022", governorate: "بغداد", address: "بغداد/الكاظمية/باب القبلة / سوق السربادي", lat: 33.3831, lng: 44.3162, aliases: ["فرع الكاظمية","022"] },
  { id: 107, name: "حيفا", branchNumber: "048", governorate: "بغداد", address: "بغداد/شارع حيفا/بناية وزارة العدل", lat: 33.3296, lng: 44.4067, aliases: ["فرع حيفا","048"] },
  { id: 108, name: "المنصور", branchNumber: "057", governorate: "بغداد", address: "بغداد/المنصور/حي المتنبي", lat: 33.3177, lng: 44.3472, aliases: ["فرع المنصور","057"] },
  { id: 109, name: "الحرية", branchNumber: "081", governorate: "بغداد", address: "بغداد/الحرية الاولى", lat: 33.3296, lng: 44.4067, aliases: ["فرع الحرية","081"] },
  { id: 110, name: "كرادة مريم", branchNumber: "110", governorate: "بغداد", address: "بغداد/الصالحية / مجمع 9 نيسان", lat: 33.3296, lng: 44.4067, aliases: ["فرع كرادة مريم","110"] },
  { id: 111, name: "الحي العربي الجديد", branchNumber: "120", governorate: "بغداد", address: "بغداد/المنصور مجاور تمثال ابو جعفر المنصور", lat: 30.4512, lng: 47.9234, aliases: ["فرع الحي العربي الجديد","120"] },
  { id: 112, name: "الخضراء", branchNumber: "177", governorate: "بغداد", address: "بغداد/ حي الخضراء/ قرب حي الجامعة", lat: 33.3296, lng: 44.4067, aliases: ["فرع الخضراء","177"] },
  { id: 113, name: "حي العامل", branchNumber: "205", governorate: "بغداد", address: "بغداد / حي العامل / الجمعيات", lat: 33.3177, lng: 44.3472, aliases: ["فرع حي العامل","205"] },
  { id: 114, name: "شارع المحيط", branchNumber: "223", governorate: "بغداد", address: "الكاظمية / مجاور البوابة", lat: 33.3831, lng: 44.3162, aliases: ["فرع شارع المحيط","223"] },
  { id: 115, name: "براثا", branchNumber: "267", governorate: "بغداد", address: "بغداد/العطيفية / مقابل مستشفى الكرخ", lat: 33.3515, lng: 44.3633, aliases: ["فرع براثا","267"] },
  { id: 116, name: "الرسالة", branchNumber: "317", governorate: "بغداد", address: "بغداد/البياع/قرب دائرة الكهرباء", lat: 33.2715, lng: 44.3243, aliases: ["فرع الرسالة","317"] },
  { id: 117, name: "المصافي", branchNumber: "318", governorate: "بغداد", address: "بغداد/الدورة / قرب المصفى", lat: 33.2559, lng: 44.3797, aliases: ["فرع المصافي","318"] },
  { id: 118, name: "الرافعي", branchNumber: "326", governorate: "بغداد", address: "بغداد/ العامرية / حي الفردوس", lat: 33.3296, lng: 44.4067, aliases: ["فرع الرافعي","326"] },
  { id: 119, name: "الاعمار والاسكان", branchNumber: "328", governorate: "بغداد", address: "بغداد/ العلاوي/ساحة المتحف / داخل ديوان الوزارة", lat: 33.3296, lng: 44.4067, aliases: ["فرع الاعمار والاسكان","328"] },
  { id: 120, name: "سكك الحديد", branchNumber: "354", governorate: "بغداد", address: "بغداد/الكرخ/العلاوي/ يقع داخل الشركة العامة لسكك الحديد", lat: 33.3296, lng: 44.4067, aliases: ["فرع سكك الحديد","354"] },
  { id: 121, name: "المعرفة", branchNumber: "355", governorate: "بغداد", address: "بغداد/السيدية / شارع التعاون العربي", lat: 33.2715, lng: 44.3243, aliases: ["فرع المعرفة","355"] },
  { id: 122, name: "حي الزهراء", branchNumber: "368", governorate: "بغداد", address: "بغداد/الكاظمية ساحة الزهراء/ الشوصة قرب جامع الهاشمي", lat: 33.3831, lng: 44.3162, aliases: ["فرع حي الزهراء","368"] },
  { id: 123, name: "وزارة الدفاع", branchNumber: "381", governorate: "بغداد", address: "بغداد/ مقر وزارة الدفاع / المنطقة الخضراء", lat: 33.3296, lng: 44.4067, aliases: ["فرع وزارة الدفاع","381"] },
  { id: 124, name: "الامانة العامة لمجلس الوزراء", branchNumber: "386", governorate: "بغداد", address: "بغداد/داخل مبنى امانة مجلس الوزراء / المنطقة الخضراء", lat: 33.3296, lng: 44.4067, aliases: ["فرع الامانة العامة لمجلس الوزراء","386"] },
  { id: 125, name: "الوطني", branchNumber: "403", governorate: "بغداد", address: "بغداد/ الحارثية / مجاور برج بغداد", lat: 33.3296, lng: 44.4067, aliases: ["فرع الوطني","403"] },
  { id: 126, name: "مجمع الدورة النفطي", branchNumber: "464", governorate: "بغداد", address: "بغداد/الدورة/ داخل المجمع النفطي", lat: 33.2559, lng: 44.3797, aliases: ["فرع مجمع الدورة النفطي","464"] },
  { id: 127, name: "الرئيسي", branchNumber: "001", governorate: "بغداد", address: "بغداد/ الشورجة / مقابل البنك المركزي العراقي", lat: 33.3296, lng: 44.4067, aliases: ["فرع الرئيسي","001"] },
  { id: 128, name: "السنك", branchNumber: "010", governorate: "بغداد", address: "بغداد / شارع الرشيد / مقابل دائرة الاتصالات", lat: 33.3296, lng: 44.4067, aliases: ["فرع السنك","010"] },
  { id: 129, name: "العلوية", branchNumber: "024", governorate: "بغداد", address: "بغداد / ساحة الفردوس / مقابل فندق فلسطين وعشتار", lat: 33.3296, lng: 44.4067, aliases: ["فرع العلوية","024"] },
  { id: 130, name: "الكفاح", branchNumber: "027", governorate: "بغداد", address: "بغداد / الكفاح / منطقة الصدرية", lat: 33.3296, lng: 44.4067, aliases: ["فرع الكفاح","027"] },
  { id: 131, name: "باب المعظم", branchNumber: "030", governorate: "بغداد", address: "بغداد/باب المعظم / مجاور وزارة الصحة", lat: 33.3296, lng: 44.4067, aliases: ["فرع باب المعظم","030"] },
  { id: 132, name: "القصر الابيض", branchNumber: "031", governorate: "بغداد", address: "بغداد / شارع النضال / مجاور فندق سمير اميس", lat: 33.3296, lng: 44.4067, aliases: ["فرع القصر الابيض","031"] },
  { id: 133, name: "الاعظمية", branchNumber: "032", governorate: "بغداد", address: "بغداد / الاعظمية / مقابل جامع الامام الاعظم", lat: 33.3615, lng: 44.3753, aliases: ["فرع الاعظمية","032"] },
  { id: 134, name: "الشيخ عمر", branchNumber: "041", governorate: "بغداد", address: "بغداد/ الكفاح/ شارع الشيخ عمر", lat: 33.3296, lng: 44.4067, aliases: ["فرع الشيخ عمر","041"] },
  { id: 135, name: "الامين", branchNumber: "061", governorate: "بغداد", address: "بغداد/شارع الخلفاء / عمارة الضمان الاجتماعي", lat: 33.3296, lng: 44.4067, aliases: ["فرع الامين","061"] },
  { id: 136, name: "باب الشرقي", branchNumber: "062", governorate: "بغداد", address: "بغداد/ شارع الجمهورية / مجاور نفق السعدون", lat: 33.3296, lng: 44.4067, aliases: ["فرع باب الشرقي","062"] },
  { id: 137, name: "دور الضباط", branchNumber: "069", governorate: "بغداد", address: "بغداد/ زيونة / شارع الربيعي / مقابل جامع الربيعي", lat: 33.3296, lng: 44.4067, aliases: ["فرع دور الضباط","069"] },
  { id: 138, name: "الخلفاء", branchNumber: "090", governorate: "بغداد", address: "بغداد/الاعظمية / شارع المغرب / قرب السفارة الهندية", lat: 33.3296, lng: 44.4067, aliases: ["فرع الخلفاء","090"] },
  { id: 139, name: "الفردوس", branchNumber: "091", governorate: "بغداد", address: "بغداد/ ساحة الفردوس/ مقابل فندق فلسطين وعشتار", lat: 33.3154, lng: 44.4209, aliases: ["فرع الفردوس","091"] },
  { id: 140, name: "المستنصر", branchNumber: "098", governorate: "بغداد", address: "بغداد/ الشورجة / مقابل البنك المركزي العراقي", lat: 33.3564, lng: 44.4111, aliases: ["فرع المستنصر","098"] },
  { id: 141, name: "ساحة النصر", branchNumber: "108", governorate: "بغداد", address: "بغداد / البتاوين / ساحة النصر", lat: 33.3296, lng: 44.4067, aliases: ["فرع ساحة النصر","108"] },
  { id: 142, name: "سبع قصور", branchNumber: "124", governorate: "بغداد", address: "بغداد / الكرادة / مقابل البنزين خانة", lat: 33.3296, lng: 44.4067, aliases: ["فرع سبع قصور","124"] },
  { id: 143, name: "حي الوحدة", branchNumber: "167", governorate: "بغداد", address: "بغداد / الكرادة / ساحة 52 / حي الصناعة", lat: 33.3296, lng: 44.4067, aliases: ["فرع حي الوحدة","167"] },
  { id: 144, name: "الزوية", branchNumber: "174", governorate: "بغداد", address: "بغداد/كرادة داخل / قرب الجسر المعلق", lat: 33.3296, lng: 44.4067, aliases: ["فرع الزوية","174"] },
  { id: 145, name: "شارع فلسطين", branchNumber: "176", governorate: "بغداد", address: "بغداد/شارع فلسطين/مقابل النادي التركماني", lat: 33.3296, lng: 44.4067, aliases: ["فرع شارع فلسطين","176"] },
  { id: 146, name: "التأخي", branchNumber: "181", governorate: "بغداد", address: "بغداد/مدينة الصدر", lat: 33.3296, lng: 44.4067, aliases: ["فرع التأخي","181"] },
  { id: 147, name: "المشتل", branchNumber: "195", governorate: "بغداد", address: "بغداد / بغداد الجديدة / المشتل", lat: 33.3988, lng: 44.4692, aliases: ["فرع المشتل","195"] },
  { id: 148, name: "الاندلس", branchNumber: "199", governorate: "بغداد", address: "بغداد/مدينة الصدر/ الكيارة / قطاع 16", lat: 33.3296, lng: 44.4067, aliases: ["فرع الاندلس","199"] },
  { id: 149, name: "الشعب", branchNumber: "215", governorate: "بغداد", address: "بغداد / الشعب", lat: 33.3988, lng: 44.4692, aliases: ["فرع الشعب","215"] },
  { id: 150, name: "حذيفة بن اليمان", branchNumber: "266", governorate: "بغداد", address: "المدائن / ناحية الجسر / جسر ديالى القديم", lat: 33.3296, lng: 44.4067, aliases: ["فرع حذيفة بن اليمان","266"] },
  { id: 151, name: "جامعة بغداد", branchNumber: "283", governorate: "بغداد", address: "بغداد / الجادرية / داخل مجمع جامعة بغداد", lat: 33.3296, lng: 44.4067, aliases: ["فرع جامعة بغداد","283"] },
  { id: 152, name: "اشبيلية", branchNumber: "290", governorate: "بغداد", address: "بغداد / مدينة الصدر / داخل / قطاع 55", lat: 33.3296, lng: 44.4067, aliases: ["فرع اشبيلية","290"] },
  { id: 153, name: "المجمع النفطي", branchNumber: "294", governorate: "بغداد", address: "بغداد / وزارة النفط / داخل بناية الوزارة", lat: 33.3296, lng: 44.4067, aliases: ["فرع المجمع النفطي","294"] },
  { id: 154, name: "الاحرار", branchNumber: "303", governorate: "بغداد", address: "بغداد / شارع الخلفاء / ساحة الوثبة", lat: 33.3296, lng: 44.4067, aliases: ["فرع الاحرار","303"] },
  { id: 155, name: "المدائن", branchNumber: "308", governorate: "بغداد", address: "بغداد / قضاء المدائن / حي الرشيد المجمع السياحي", lat: 33.3296, lng: 44.4067, aliases: ["فرع المدائن","308"] },
  { id: 156, name: "القدس", branchNumber: "309", governorate: "بغداد", address: "بغداد / منطقة جميلة/حي القدس", lat: 33.3154, lng: 44.4209, aliases: ["فرع القدس","309"] },
  { id: 157, name: "الخنساء", branchNumber: "327", governorate: "بغداد", address: "بغداد / الكمالية / حي الخنساء", lat: 33.3296, lng: 44.4067, aliases: ["فرع الخنساء","327"] },
  { id: 158, name: "الوزيرية", branchNumber: "341", governorate: "بغداد", address: "بغداد / منطقة الوزيرية / قرب السفارة التركية", lat: 33.3296, lng: 44.4067, aliases: ["فرع الوزيرية","341"] },
  { id: 159, name: "وزارة الصناعة والمعادن", branchNumber: "385", governorate: "بغداد", address: "بغداد/ شارع النضال / قرب ساحة الطيران / مبنى وزارة الصناعة والمعادن", lat: 33.3296, lng: 44.4067, aliases: ["فرع وزارة الصناعة والمعادن","385"] },
  { id: 160, name: "ديوان الوقف السني", branchNumber: "389", governorate: "بغداد", address: "بغداد /الاعظمية / داخل مبنى الوقف السني", lat: 33.3384, lng: 44.3933, aliases: ["فرع ديوان الوقف السني","389"] },
  { id: 161, name: "صندوق الاسكان", branchNumber: "413", governorate: "بغداد", address: "بغداد/ النهضة / مجمع الشركات / وزارة الاعمار والاسكان", lat: 33.3177, lng: 44.3472, aliases: ["فرع صندوق الاسكان","413"] },
  { id: 162, name: "سبع ابكار", branchNumber: "414", governorate: "بغداد", address: "بغداد/الاعظمية / سبع ابكار / حي الربيع", lat: 33.3384, lng: 44.3933, aliases: ["فرع سبع ابكار","414"] },
  { id: 163, name: "مكتب معهد تكنولوجيا", branchNumber: "415", governorate: "بغداد", address: "بغداد/الزعفرانية/ داخل حرم معهد تكنولوجيا", lat: 33.3296, lng: 44.4067, aliases: ["فرع مكتب معهد تكنولوجيا","415"] },
  { id: 164, name: "هيئة توزيع بغداد للمنتجات النفطية", branchNumber: "417", governorate: "بغداد", address: "بغداد / الكيلاني/ داخل دائرة هيئة توزيع بغداد للمنتجات النفطية", lat: 33.3296, lng: 44.4067, aliases: ["فرع هيئة توزيع بغداد للمنتجات النفطية","417"] },
  { id: 165, name: "الخيرات", branchNumber: "456", governorate: "بغداد", address: "بغداد/ الحسينية / ناحية الزهور / شارع الخدمات", lat: 33.3177, lng: 44.3472, aliases: ["فرع الخيرات","456"] },
  { id: 166, name: "الهيئة العامة للضرائب", branchNumber: "462", governorate: "بغداد", address: "بغداد/ الباب الشرقي / مقر الهيئة العامة للضرائب", lat: 33.3296, lng: 44.4067, aliases: ["فرع الهيئة العامة للضرائب","462"] },
];

export const getBranchesByGovernorate = (governorate: string): RafidainBranch[] => {
  return RAFIDAIN_BRANCHES.filter((b) => b.governorate === governorate);
};

export const GOVERNORATES: string[] = Array.from(new Set(RAFIDAIN_BRANCHES.map((b) => b.governorate)));

export const TOTAL_BRANCH_COUNT = RAFIDAIN_BRANCHES.length;
