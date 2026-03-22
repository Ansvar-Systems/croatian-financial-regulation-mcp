/**
 * Seed the HANFA/HNB database with sample provisions for testing.
 *
 * Inserts Croatian HANFA pravilnici, smjernice, and HNB odluke so MCP tools
 * can be tested without a full ingestion pipeline.
 *
 * Usage:
 *   npx tsx scripts/seed-sample.ts
 *   npx tsx scripts/seed-sample.ts --force   # drop and recreate
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

const DB_PATH = process.env["HANFA_DB_PATH"] ?? "data/hanfa.db";
const force = process.argv.includes("--force");

const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

if (force && existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log(`Deleted existing database at ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);

console.log(`Database initialised at ${DB_PATH}`);

// Sourcebooks

interface SourcebookRow {
  id: string;
  name: string;
  description: string;
}

const sourcebooks: SourcebookRow[] = [
  {
    id: "HANFA_PRAVILNICI",
    name: "HANFA Pravilnici (Rulebooks)",
    description:
      "Binding rulebooks (pravilnici) issued by HANFA covering capital markets, investment firms, alternative investment funds, and insurance.",
  },
  {
    id: "HANFA_SMJERNICE",
    name: "HANFA Smjernice (Guidelines)",
    description:
      "Non-binding guidelines (smjernice) issued by HANFA providing compliance guidance to supervised entities.",
  },
  {
    id: "HNB_ODLUKE",
    name: "HNB Odluke (HNB Decisions)",
    description:
      "Binding decisions (odluke) issued by the Croatian National Bank (Hrvatska narodna banka) covering prudential requirements for credit institutions.",
  },
];

const insertSourcebook = db.prepare(
  "INSERT OR IGNORE INTO sourcebooks (id, name, description) VALUES (?, ?, ?)",
);

for (const sb of sourcebooks) {
  insertSourcebook.run(sb.id, sb.name, sb.description);
}

console.log(`Inserted ${sourcebooks.length} sourcebooks`);

// Sample provisions

interface ProvisionRow {
  sourcebook_id: string;
  reference: string;
  title: string;
  text: string;
  type: string;
  status: string;
  effective_date: string;
  chapter: string;
  section: string;
}

const provisions: ProvisionRow[] = [
  // HANFA Pravilnici
  {
    sourcebook_id: "HANFA_PRAVILNICI",
    reference: "Pravilnik o upravljanju rizicima",
    title: "Pravilnik o upravljanju rizicima investicijskih društava",
    text: "Ovim Pravilnikom propisuju se uvjeti i načini upravljanja rizicima u investicijskim društvima. Investicijska društva dužna su uspostaviti robusne strategije, politike, postupke i sustave za identifikaciju, mjerenje, upravljanje i praćenje kreditnog rizika, tržišnog rizika, operativnog rizika i rizika likvidnosti. Upravljačko tijelo odgovorno je za nadzor nad sustavom upravljanja rizicima i mora odobriti sve materijalne promjene u politikama upravljanja rizicima.",
    type: "Pravilnik",
    status: "in_force",
    effective_date: "2018-01-01",
    chapter: "1",
    section: "1.1",
  },
  {
    sourcebook_id: "HANFA_PRAVILNICI",
    reference: "Pravilnik o kapitalu investicijskih društava",
    title: "Pravilnik o kapitalnim zahtjevima investicijskih društava",
    text: "Pravilnikom se utvrđuju minimalni kapitalni zahtjevi za investicijska društva u Republici Hrvatskoj sukladno Uredbi (EU) 2019/2033 (IFR). Investicijska društva dužna su u svakom trenutku održavati dostatnu razinu regulatornog kapitala koji pokriva K-faktore i zahtjev za trajnu minimalnu kapitalnu potrebu. Minimalni regulatorni kapital ne smije biti niži od 750 000 EUR za investicijska društva koja su ovlaštena za izvršavanje naloga za račun klijenata.",
    type: "Pravilnik",
    status: "in_force",
    effective_date: "2021-06-26",
    chapter: "2",
    section: "2.1",
  },
  {
    sourcebook_id: "HANFA_PRAVILNICI",
    reference: "Pravilnik o upravljanju alternativnim investicijskim fondovima",
    title: "Pravilnik o uvjetima za obavljanje djelatnosti upravljanja alternativnim investicijskim fondovima",
    text: "Ovim Pravilnikom uređuju se uvjeti za dobivanje odobrenja za rad upravitelja alternativnih investicijskih fondova (UAIF), organizacijski zahtjevi, zahtjevi za upravljanje rizicima i likvidnošću, politika naknada te zahtjevi za transparentnost i objavu informacija. UAIF mora imati kapital od najmanje 300 000 EUR, a ako upravljana imovina prelazi 250 milijuna EUR, kapital se povećava za 0,02% iznosa koji prelazi tu granicu.",
    type: "Pravilnik",
    status: "in_force",
    effective_date: "2014-07-22",
    chapter: "3",
    section: "3.1",
  },
  {
    sourcebook_id: "HANFA_PRAVILNICI",
    reference: "Pravilnik o prospektu",
    title: "Pravilnik o sadržaju i obliku prospekta pri javnoj ponudi vrijednosnih papira",
    text: "Pravilnikom se utvrđuje minimalni sadržaj, format i struktura prospekta pri javnoj ponudi vrijednosnih papira i uvrštavanju na regulirano tržište sukladno Uredbi (EU) 2017/1129 (Prospekt uredba). Prospekt mora sadržavati sve informacije koje su, prema prirodi izdavatelja i vrijednosnih papira koji se nude javnosti ili uvrštavaju na regulirano tržište, neophodne kako bi investitori mogli donijeti informiranu investicijsku odluku.",
    type: "Pravilnik",
    status: "in_force",
    effective_date: "2019-07-21",
    chapter: "4",
    section: "4.1",
  },
  {
    sourcebook_id: "HANFA_PRAVILNICI",
    reference: "Pravilnik o tržišnim zloupotrebama",
    title: "Pravilnik o sprječavanju tržišnih zlouporaba",
    text: "Pravilnikom se razrađuju obveze iz Uredbe (EU) br. 596/2014 (MAR) u pogledu sprječavanja insider trgovanja i manipulacije tržištem. Emitenti su dužni bez odgode javno objaviti povlaštene informacije, voditi popis osoba s pristupom povlaštenim informacijama te prijaviti sve sumnjive transakcije HANFA-i. Osobama kojima su povjerene upravljačke odgovornosti zabranjeno je kupovati ili prodavati financijske instrumente emitenta za vlastiti račun u zatvorenom razdoblju od 30 dana prije objave polugodišnjih ili godišnjih financijskih izvještaja.",
    type: "Pravilnik",
    status: "in_force",
    effective_date: "2016-07-03",
    chapter: "5",
    section: "5.1",
  },
  // HANFA Guidelines
  {
    sourcebook_id: "HANFA_SMJERNICE",
    reference: "Smjernice o procjeni prikladnosti",
    title: "Smjernice o procjeni prikladnosti i primjerenosti investicijskih usluga",
    text: "Ove Smjernice razrađuju zahtjeve za procjenu prikladnosti (suitability) i primjerenosti (appropriateness) iz Direktive MiFID II. Investicijska društva obvezna su od klijenata prikupiti sve potrebne informacije o njihovim financijskim situacijama, investicijskim ciljevima i sklonosti prema riziku kako bi osigurala prikladnost preporučenih ulaganja. Procjena prikladnosti mora biti provedena za svaku personaliziranu preporuku te dokumentirana u pismenom obliku.",
    type: "Smjernice",
    status: "in_force",
    effective_date: "2019-10-01",
    chapter: "1",
    section: "1.1",
  },
  {
    sourcebook_id: "HANFA_SMJERNICE",
    reference: "Smjernice o najboljoj izvršbi",
    title: "Smjernice o izvršavanju naloga uz najboljie uvjete",
    text: "Smjernicama se pojašnjava primjena zahtjeva za best execution prema MiFID II. Investicijska društva dužna su poduzeti sve dostatne mjere za postizanje najboljeg mogućeg rezultata za klijente pri izvršavanju naloga, uzimajući u obzir cijenu, troškove, brzinu, vjerojatnost izvršenja i namire, obujam, narav ili bilo koji drugi čimbenik bitan za izvršavanje naloga. Za male investitore, ukupna naknada (cijena financijskog instrumenta i transakcijski troškovi) jedini je čimbenik.",
    type: "Smjernice",
    status: "in_force",
    effective_date: "2018-01-03",
    chapter: "2",
    section: "2.1",
  },
  // HNB Decisions
  {
    sourcebook_id: "HNB_ODLUKE",
    reference: "Odluka o regulatornom kapitalu kreditnih institucija",
    title: "Odluka o regulatornom kapitalu i kapitalnim zahtjevima kreditnih institucija",
    text: "Ovom Odlukom utvrđuju se zahtjevi za regulatorni kapital kreditnih institucija sukladno Uredbi (EU) br. 575/2013 (CRR). Kreditne institucije dužne su u svakom trenutku održavati ukupni omjer kapitala od najmanje 8%, omjer osnovnog kapitala Tier 1 od najmanje 6% i omjer redovnog osnovnog kapitala (CET1) od najmanje 4,5%. Uz zakonski minimum, HNB propisuje zaštitni sloj za očuvanje kapitala od 2,5% i, prema procjeni sistemskog rizika, protuciklički zaštitni sloj kapitala.",
    type: "Odluka",
    status: "in_force",
    effective_date: "2014-01-01",
    chapter: "1",
    section: "1.1",
  },
  {
    sourcebook_id: "HNB_ODLUKE",
    reference: "Odluka o upravljanju likvidnosnim rizikom",
    title: "Odluka o upravljanju likvidnosnim rizikom i zahtjevima za likvidnosnu pokrivenost",
    text: "Odluka utvrđuje zahtjeve za upravljanje likvidnosnim rizikom kreditnih institucija. Kreditne institucije moraju održavati koeficijent likvidnosne pokrivenosti (LCR) od najmanje 100% te koeficijent neto stabilnog financiranja (NSFR) od najmanje 100%. Kreditne institucije dužne su HNB-u dostavljati izvještaje o likvidnosti na dnevnoj, tjednoj i mjesečnoj razini te imati uspostavljene planove oporavka likvidnosti za krizne situacije.",
    type: "Odluka",
    status: "in_force",
    effective_date: "2015-10-01",
    chapter: "2",
    section: "2.1",
  },
  {
    sourcebook_id: "HNB_ODLUKE",
    reference: "Odluka o velikim izloženostima",
    title: "Odluka o granicama izloženosti prema pojedinim osobama i skupinama povezanih osoba",
    text: "Ovom Odlukom se propisuju ograničenja velikih izloženosti kreditnih institucija prema pojedinim osobama i skupinama povezanih osoba sukladno CRR. Izloženost kreditne institucije prema pojedinoj osobi ili skupini povezanih osoba ne smije premašiti 25% priznatog kapitala institucije. Za sistemski važne institucije, ograničenje izloženosti prema globalnim sistemski važnim institucijama iznosi 15% priznatog kapitala.",
    type: "Odluka",
    status: "in_force",
    effective_date: "2014-01-01",
    chapter: "3",
    section: "3.1",
  },
];

const insertProvision = db.prepare(`
  INSERT INTO provisions (sourcebook_id, reference, title, text, type, status, effective_date, chapter, section)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction(() => {
  for (const p of provisions) {
    insertProvision.run(
      p.sourcebook_id,
      p.reference,
      p.title,
      p.text,
      p.type,
      p.status,
      p.effective_date,
      p.chapter,
      p.section,
    );
  }
});

insertAll();

console.log(`Inserted ${provisions.length} sample provisions`);

// Sample enforcement actions

interface EnforcementRow {
  firm_name: string;
  reference_number: string;
  action_type: string;
  amount: number;
  date: string;
  summary: string;
  sourcebook_references: string;
}

const enforcements: EnforcementRow[] = [
  {
    firm_name: "Erste Plavi upravljanje obveznim mirovinskim fondovima d.d.",
    reference_number: "2023-HANFA-0234",
    action_type: "fine",
    amount: 200_000,
    date: "2023-09-12",
    summary:
      "HANFA je izrekla novčanu kaznu od 200.000 HRK društvu Erste Plavi upravljanje obveznim mirovinskim fondovima d.d. zbog povrede odredbi o upravljanju sukobom interesa i neadekvatne dokumentacije o procjeni prikladnosti investicijskih odluka za fondove u upravljanju. Utvrđeno je da su određene transakcije financijskim instrumentima provedene bez prethodne i propisne procjene sukladnosti s politikama fonda.",
    sourcebook_references: "Pravilnik o upravljanju rizicima, Smjernice o procjeni prikladnosti",
  },
  {
    firm_name: "InterCapital Securities d.d.",
    reference_number: "2022-HANFA-0178",
    action_type: "restriction",
    amount: 0,
    date: "2022-07-05",
    summary:
      "HANFA je privremeno ograničila djelatnost društvu InterCapital Securities d.d. u dijelu koji se odnosi na upravljanje portfeljem klijenata, zbog sustavnih propusta u provođenju procjena prikladnosti (suitability) za maloprodajne klijente. Utvrđeno je da društvo nije prikupljalo adekvatne informacije o financijskoj situaciji i toleranciji na rizik klijenata te je preporučivalo financijske instrumente koji nisu bili prikladni za profil pojedinih klijenata.",
    sourcebook_references: "Smjernice o procjeni prikladnosti, Pravilnik o upravljanju rizicima",
  },
];

const insertEnforcement = db.prepare(`
  INSERT INTO enforcement_actions (firm_name, reference_number, action_type, amount, date, summary, sourcebook_references)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertEnforcementsAll = db.transaction(() => {
  for (const e of enforcements) {
    insertEnforcement.run(
      e.firm_name,
      e.reference_number,
      e.action_type,
      e.amount,
      e.date,
      e.summary,
      e.sourcebook_references,
    );
  }
});

insertEnforcementsAll();

console.log(`Inserted ${enforcements.length} sample enforcement actions`);

// Summary

const provisionCount = (
  db.prepare("SELECT count(*) as cnt FROM provisions").get() as { cnt: number }
).cnt;
const sourcebookCount = (
  db.prepare("SELECT count(*) as cnt FROM sourcebooks").get() as { cnt: number }
).cnt;
const enforcementCount = (
  db.prepare("SELECT count(*) as cnt FROM enforcement_actions").get() as { cnt: number }
).cnt;
const ftsCount = (
  db.prepare("SELECT count(*) as cnt FROM provisions_fts").get() as { cnt: number }
).cnt;

console.log(`\nDatabase summary:`);
console.log(`  Sourcebooks:          ${sourcebookCount}`);
console.log(`  Provisions:           ${provisionCount}`);
console.log(`  Enforcement actions:  ${enforcementCount}`);
console.log(`  FTS entries:          ${ftsCount}`);
console.log(`\nDone. Database ready at ${DB_PATH}`);

db.close();
