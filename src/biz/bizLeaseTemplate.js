// The standard Kampasika Biz lease, in English and Kiswahili.
//
// Operators start from this and edit it freely (stored on their operator doc
// as leaseTemplate). {{placeholders}} are filled in by the server when a
// lease is issued — see renderText() in functions/biz/bizLeases.js.
//
// This is a plain-language starting point, NOT legal advice: operators (and
// Kampasika) should have a Tanzanian lawyer review it before relying on it.

export const LEASE_PLACEHOLDERS = [
  { key: "businessName", en: "Your business name", sw: "Jina la biashara yako" },
  { key: "landlordContact", en: "Your contact person", sw: "Mtu wako wa mawasiliano" },
  { key: "studentName", en: "Student's full name", sw: "Jina kamili la mwanafunzi" },
  { key: "university", en: "Student's university", sw: "Chuo cha mwanafunzi" },
  { key: "regNumber", en: "Student's reg. number", sw: "Namba ya usajili ya mwanafunzi" },
  { key: "roomLabel", en: "Room (number, type, building)", sw: "Chumba (namba, aina, jengo)" },
  { key: "location", en: "Location", sw: "Mahali" },
  { key: "rent", en: "Rent amount (TZS)", sw: "Kiasi cha kodi (TZS)" },
  { key: "rentPeriod", en: "Rent period (month / semester / year)", sw: "Kipindi cha kodi" },
  { key: "deposit", en: "Deposit (TZS)", sw: "Amana (TZS)" },
  { key: "startDate", en: "Start date", sw: "Tarehe ya kuanza" },
  { key: "endDate", en: "End date", sw: "Tarehe ya kuisha" },
  { key: "dueDay", en: "Day rent is due", sw: "Siku ya kulipa kodi" },
  { key: "noticeDays", en: "Notice period (days)", sw: "Muda wa taarifa (siku)" },
  { key: "utilities", en: "Water & electricity arrangement", sw: "Mpango wa maji na umeme" },
  { key: "extraTerms", en: "Extra terms for this student", sw: "Masharti ya ziada kwa mwanafunzi huyu" },
];

const CLAUSES_EN = [
  {
    title: "1. Parties",
    body: "This tenancy agreement is between {{businessName}} (\"the Landlord\") and {{studentName}}, a student at {{university}}, registration number {{regNumber}} (\"the Tenant\").",
  },
  {
    title: "2. The room",
    body: "The Landlord lets to the Tenant {{roomLabel}} at {{location}} (\"the Room\"), together with shared use of the common areas of the building.",
  },
  {
    title: "3. Term",
    body: "The tenancy starts on {{startDate}} and ends on {{endDate}}, unless it is ended earlier under clause 10.",
  },
  {
    title: "4. Rent",
    body: "The rent is TZS {{rent}} per {{rentPeriod}}, paid in advance by day {{dueDay}} of each rent period. Rent is paid through the payment options shown in Kampasika (mobile money straight to the Landlord's own account) or any other method the Landlord confirms in writing. The Landlord will give a receipt or payment record for every payment.",
  },
  {
    title: "5. Deposit",
    body: "Before moving in, the Tenant pays a refundable deposit of TZS {{deposit}}. The Landlord returns the deposit within 14 days after the tenancy ends, less only unpaid rent and the reasonable cost of repairing damage beyond normal wear and tear. The Landlord gives the Tenant a written list of any deductions.",
  },
  {
    title: "6. Water and electricity",
    body: "Water and electricity are {{utilities}}.",
  },
  {
    title: "7. Using the room",
    body: "The Room is for the Tenant's own residence only. The Tenant will not sublet the Room or let anyone else live in it without the Landlord's written permission, will follow the building's house rules (including visitor rules and quiet hours), and will not use the Room for anything illegal.",
  },
  {
    title: "8. Care and repairs",
    body: "The Tenant keeps the Room clean and in good condition and reports any damage or fault to the Landlord promptly. The Landlord keeps the building safe and secure and repairs faults that are not caused by the Tenant — including water, electricity, doors, locks and windows — within a reasonable time after being told.",
  },
  {
    title: "9. Access",
    body: "The Landlord may enter the Room for inspection or repairs after giving at least 24 hours' notice, except in an emergency.",
  },
  {
    title: "10. Ending the tenancy early",
    body: "Either party may end this agreement early by giving {{noticeDays}} days' written notice (a message through Kampasika counts as written notice). Rent already paid for a period that has started is not refundable unless both parties agree otherwise.",
  },
  {
    title: "11. Breaking the agreement",
    body: "If rent is more than 14 days late, or the Tenant seriously breaks this agreement or the house rules, the Landlord will give written notice asking the Tenant to put it right within 7 days. If it is not put right, the Landlord may end the tenancy by giving a further 14 days' written notice.",
  },
  {
    title: "12. Moving out",
    body: "At the end of the tenancy the Tenant returns all keys, removes their belongings and leaves the Room clean and in the same condition as at the start, apart from normal wear and tear.",
  },
  {
    title: "13. Extra terms",
    body: "{{extraTerms}}",
  },
  {
    title: "14. Signing",
    body: "The Landlord agrees to this agreement by issuing it through Kampasika Biz, and the Tenant agrees by signing it in Kampasika. Both parties accept this electronic agreement as binding. Kampasika provides the platform only and is not a party to this agreement.",
  },
];

const CLAUSES_SW = [
  {
    title: "1. Wahusika",
    body: "Mkataba huu wa upangaji ni kati ya {{businessName}} (\"Mwenye Nyumba\") na {{studentName}}, mwanafunzi wa {{university}}, namba ya usajili {{regNumber}} (\"Mpangaji\").",
  },
  {
    title: "2. Chumba",
    body: "Mwenye Nyumba anampangisha Mpangaji {{roomLabel}} kilichopo {{location}} (\"Chumba\"), pamoja na matumizi ya pamoja ya maeneo ya jumla ya jengo.",
  },
  {
    title: "3. Muda",
    body: "Upangaji unaanza tarehe {{startDate}} na kuisha tarehe {{endDate}}, isipokuwa ukisitishwa mapema kwa mujibu wa kifungu cha 10.",
  },
  {
    title: "4. Kodi",
    body: "Kodi ni TZS {{rent}} kwa {{rentPeriod}}, inayolipwa mapema kabla ya siku ya {{dueDay}} ya kila kipindi cha kodi. Kodi inalipwa kupitia njia za malipo zinazoonyeshwa kwenye Kampasika (pesa ya simu moja kwa moja kwenye akaunti ya Mwenye Nyumba) au njia nyingine yoyote Mwenye Nyumba atakayothibitisha kwa maandishi. Mwenye Nyumba atatoa risiti au kumbukumbu ya malipo kwa kila malipo.",
  },
  {
    title: "5. Amana",
    body: "Kabla ya kuhamia, Mpangaji analipa amana inayorudishwa ya TZS {{deposit}}. Mwenye Nyumba atarudisha amana ndani ya siku 14 baada ya upangaji kuisha, akitoa tu kodi isiyolipwa na gharama za busara za kurekebisha uharibifu zaidi ya uchakavu wa kawaida. Mwenye Nyumba atampa Mpangaji orodha ya maandishi ya makato yoyote.",
  },
  {
    title: "6. Maji na umeme",
    body: "Maji na umeme {{utilities}}.",
  },
  {
    title: "7. Matumizi ya chumba",
    body: "Chumba ni kwa ajili ya makazi ya Mpangaji mwenyewe tu. Mpangaji hatapangisha Chumba kwa mtu mwingine wala kumruhusu mtu mwingine kuishi humo bila ruhusa ya maandishi ya Mwenye Nyumba, atafuata kanuni za jengo (ikiwemo kanuni za wageni na saa za utulivu), na hatatumia Chumba kwa jambo lolote lisilo halali.",
  },
  {
    title: "8. Utunzaji na matengenezo",
    body: "Mpangaji atakiweka Chumba safi na katika hali nzuri na atamjulisha Mwenye Nyumba mapema kuhusu uharibifu au hitilafu yoyote. Mwenye Nyumba ataweka jengo salama na atarekebisha hitilafu zisizosababishwa na Mpangaji — ikiwemo maji, umeme, milango, kufuli na madirisha — ndani ya muda wa busara baada ya kujulishwa.",
  },
  {
    title: "9. Kuingia chumbani",
    body: "Mwenye Nyumba anaweza kuingia Chumbani kwa ukaguzi au matengenezo baada ya kutoa taarifa ya angalau saa 24, isipokuwa wakati wa dharura.",
  },
  {
    title: "10. Kusitisha mapema",
    body: "Upande wowote unaweza kusitisha mkataba huu mapema kwa kutoa taarifa ya maandishi ya siku {{noticeDays}} (ujumbe kupitia Kampasika unahesabika kama taarifa ya maandishi). Kodi iliyokwisha lipwa kwa kipindi kilichoanza hairudishwi isipokuwa pande zote mbili zikikubaliana vinginevyo.",
  },
  {
    title: "11. Kuvunja mkataba",
    body: "Kodi ikichelewa zaidi ya siku 14, au Mpangaji akivunja kwa kiasi kikubwa mkataba huu au kanuni za jengo, Mwenye Nyumba atatoa taarifa ya maandishi kumtaka Mpangaji arekebishe ndani ya siku 7. Isiporekebishwa, Mwenye Nyumba anaweza kusitisha upangaji kwa kutoa taarifa nyingine ya maandishi ya siku 14.",
  },
  {
    title: "12. Kuhama",
    body: "Upangaji ukiisha, Mpangaji atarudisha funguo zote, ataondoa mali zake na kuacha Chumba kikiwa safi na katika hali ile ile ya mwanzo, isipokuwa uchakavu wa kawaida.",
  },
  {
    title: "13. Masharti ya ziada",
    body: "{{extraTerms}}",
  },
  {
    title: "14. Kusaini",
    body: "Mwenye Nyumba anakubali mkataba huu kwa kuutoa kupitia Kampasika Biz, na Mpangaji anakubali kwa kuusaini ndani ya Kampasika. Pande zote mbili zinakubali mkataba huu wa kielektroniki kuwa unafunga kisheria. Kampasika inatoa jukwaa tu na si mhusika wa mkataba huu.",
  },
];

export const DEFAULT_LEASE_TERMS = {
  rentPeriod: "month",
  deposit: "",
  dueDay: 5,
  noticeDays: 30,
  utilities: "",
};

export function defaultClauses(language) {
  return (language === "sw" ? CLAUSES_SW : CLAUSES_EN).map(c => ({ ...c }));
}

// The operator's saved template for a language (operators.leaseTemplates.en /
// .sw), or the standard one. Default terms are shared (operators.leaseDefaults).
export function templateFor(operator, language) {
  const saved = operator?.leaseTemplates?.[language];
  const defaults = { ...DEFAULT_LEASE_TERMS, ...(operator?.leaseDefaults || {}) };
  if (saved?.clauses?.length) {
    return { language, clauses: saved.clauses.map(c => ({ ...c })), defaults, custom: true };
  }
  return { language, clauses: defaultClauses(language), defaults, custom: false };
}

// Preview only — the real text is rendered on the server.
export function renderText(text, values) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) && values[key] !== "" ? String(values[key]) : match
  ));
}
