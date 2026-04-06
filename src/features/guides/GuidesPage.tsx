import { useState } from "react";
import { Card } from "../../components/Card";

interface Guide {
  id: string;
  title: string;
  content: string;
}

const guides: Guide[] = [
  {
    id: "mb-setup",
    title: "MB įkūrimas ir registracija",
    content: `## Mažoji bendrija (MB)

Mažoji bendrija — tai juridinis asmuo, tinkamas smulkiam verslui. Pagrindiniai žingsniai:

1. **Steigimo sutartis** — pasirašoma notaro ar el. būdu per Registrų centrą
2. **Registracija** — Juridinių asmenų registre (JAR)
3. **Banko sąskaita** — atidaroma verslo sąskaita
4. **VMI registracija** — mokesčių mokėtojo registracija
5. **Sodra** — socialinio draudimo registracija

### Mokesčiai

MB narys moka priklausomai nuo pajamų gavimo būdo:

**Su civiline sutartimi:**
- **GPM** — 15% nuo (pajamos - Sodra įmokos)
- **VSD** — 12.52% nuo faktinių išmokų (Sodra pensija)
- **PSD** — 6.98% nuo faktinių išmokų (Sodra sveikata)

**Pelno išėmimas (be civilinės sutarties):**
- **GPM** — 15% nuo išimto pelno
- **VSD** — savanoriška (rekomenduojama stažui kaupti)
- **PSD** — privaloma nuo MMA bazės`,
  },
  {
    id: "vat-guide",
    title: "PVM registracija ir deklaravimas",
    content: `## PVM (pridėtinės vertės mokestis)

### Kada registruotis?

Privaloma PVM registracija kai **metinės pajamos viršija 45 000 EUR**.

Savanoriška registracija galima bet kada — naudinga jei turite daug PVM apmokestinamų pirkimų.

### Deklaravimas

- **FR0600** forma — kas ketvirtį (iki kito mėnesio 25 d.)
- Pardavimai ES klientams (B2B) — taikomas atvirkštinis apmokestinimas
- Pardavimai US/užsienio klientams — PVM netaikomas (eksportas)

### Svarbu

Teikiant paslaugas **US klientams**, PVM sąskaitoje nurodoma:
> "Atvirkštinio apmokestinimo PVM mechanizmas netaikomas. PVM neapmokestinama pagal PVMĮ 53 str."`,
  },
  {
    id: "foreign-income",
    title: "Pajamos iš užsienio klientų",
    content: `## Pajamos iš US/užsienio klientų

### Valiutos konvertavimas

Pajamos užsienio valiuta konvertuojamos į EUR pagal:
- **ECB kursą** pajamų gavimo dieną, arba
- **Banko kursą** pervedimo dieną

### Dvigubas apmokestinimas

Lietuva turi dvigubo apmokestinimo vengimo sutartis su daugeliu šalių, įskaitant JAV.

- W-8BEN forma — pateikiama US klientui/platformai
- Apsaugo nuo US mokesčių išskaitymo (withholding tax)

### Pajamų deklaravimas

Visos pajamos deklaruojamos **metinėje GPM314 deklaracijoje** (iki gegužės 1 d.).
Avansinis GPM mokamas kas ketvirtį.`,
  },
  {
    id: "sodra-guide",
    title: "Sodra įmokos MB nariui",
    content: `## Sodra įmokos

MB narys, gaunantis pajamas pagal civilinę sutartį, privalo mokėti Sodra įmokas:

### Su civiline sutartimi

**VSD (pensija) — 12.52%**
- Bazė: **faktinės išmokos** nariui
- Lubos: ~120 000 EUR per metus (priklauso nuo VDU)
- Mokama kas mėnesį iki 15 d.

**PSD (sveikata) — 6.98%**
- Bazė: **faktinės išmokos** nariui
- Lubų nėra
- Mokama kas mėnesį iki 15 d.

### Pelno išėmimas (be civilinės sutarties)

- **GPM** 15% nuo išimto pelno
- **VSD** — savanoriška. Rekomenduojama mokėti nuo MMA bazės stažui rinkti
- **PSD** — privaloma nuo MMA bazės

### Stažas

1 mėn. stažo = VSD sumokėta nuo >= 1 MMA bazės.
Jei bazė mažesnė už MMA — stažas proporcingai mažesnis.

### Minimali įmoka

Jei pajamos mažos, vis tiek reikia mokėti minimaliąsias Sodra įmokas nuo MMA.

### SAV pranešimai

Kas mėnesį iki 15 d. pateikiamas **SAV pranešimas** per Sodra portalą.`,
  },
  {
    id: "withdrawal-methods",
    title: "Pinigų išėmimo būdai",
    content: `## Pinigų išėmimo iš MB būdai

MB narys gali išsiimti pinigus trimis būdais. Galima derinti kelis.

### 1. Darbo sutartis (alga)

- **GPM**: 20% (aukštesnis nei kiti būdai)
- **Sodra**: VSD 12.52% + PSD 6.98% (darbuotojo) + ~1.77% (darbdavio)
- **Stažas**: taip, pilnas
- **Mokėjimas**: kas mėnesį, ne rečiau
- **Minimali alga**: MMA (2026 m. — 1 088 EUR/mėn.)

**Kas mėnesį reikia:**
1. Išmokėti algą darbuotojui (sau)
2. Sumokėti Sodra įmokas (iki 15 d.)
3. Pervesti GPM į VMI (iki 15 d.)
4. Pateikti SAV pranešimą Sodrai (iki 15 d.)
5. Pateikti FR0572 (GPM deklaraciją) VMI (iki 15 d.)

**Svarbu:** negalima mokėti kartą per metus. Alga turi būti reguliari — kas mėnesį.

### 2. Civilinė sutartis

- **GPM**: 15%
- **Sodra**: VSD 12.52% + PSD 6.98%
- **Stažas**: taip
- **Mokėjimas**: pagal sutarties sąlygas (gali būti kas ketvirtį ar rečiau)
- **PVM riba**: jei metinė suma > 45 000 EUR — privaloma PVM registracija

**Privalumai prieš darbo sutartį:**
- Mažesnis GPM (15% vs 20%)
- Lankstesnis mokėjimo grafikas
- Nėra darbdavio Sodros dalies
- Paprastesnis administravimas

**Kas reikia:**
1. Sudaryti civilinę sutartį tarp MB ir nario
2. Mokėti pagal sutarties grafiką
3. Sodra — kas mėnesį iki 15 d.
4. SAV pranešimas — kas mėnesį

### 3. Pelno išėmimas (dividendai)

- **GPM**: 15%
- **Sodra**: tik privaloma PSD nuo MMA (jei nėra kitų Sodra šaltinių)
- **Stažas**: ne (nebent mokate savanorišką VSD)
- **Mokėjimas**: bet kada, bet kokia suma

**Privalumai:**
- Mažiausi mokesčiai
- Jokių mėnesinių įsipareigojimų
- Galima imti kai reikia

**Trūkumai:**
- Nekaupia stažo
- MB turi turėti pelną (pajamos > išlaidos)

### Rekomenduojama strategija

**Optimalus derinys stažui + žemiems mokesčiams:**
1. Civilinė sutartis nuo MMA bazės (stažui kaupti) — ~13 000 EUR/metus
2. Likutį — pelno išėmimas (tik GPM 15%)

Tai duoda pilną stažą ir žemiausią efektyvų mokesčio tarifą.

### Pinigai MB viduje

Neišimti pinigai **neapmokestinami**. MB gali:
- Investuoti (vertybiniai popieriai, indėliai)
- Kaupti rezervą
- Pirkti turtą verslo reikmėms

GPM mokamas tik kai pinigai faktiškai išimami nariui.`,
  },
];

export function GuidesPage() {
  const [activeGuide, setActiveGuide] = useState<string>(guides[0].id);
  const guide = guides.find((g) => g.id === activeGuide) ?? guides[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gidai</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-1">
          {guides.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGuide(g.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                activeGuide === g.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          <Card>
            <div className="prose prose-sm max-w-none">
              {guide.content.split("\n").map((line, i) => {
                if (line.startsWith("## "))
                  return (
                    <h2 key={i} className="mb-4 text-xl font-bold text-gray-900">
                      {line.slice(3)}
                    </h2>
                  );
                if (line.startsWith("### "))
                  return (
                    <h3 key={i} className="mb-2 mt-4 text-lg font-semibold text-gray-800">
                      {line.slice(4)}
                    </h3>
                  );
                if (line.startsWith("- "))
                  return (
                    <li key={i} className="ml-4 text-gray-700">
                      {renderInline(line.slice(2))}
                    </li>
                  );
                if (line.startsWith("> "))
                  return (
                    <blockquote key={i} className="border-l-4 border-gray-300 pl-4 italic text-gray-600">
                      {line.slice(2)}
                    </blockquote>
                  );
                if (/^\d+\.\s/.test(line))
                  return (
                    <li key={i} className="ml-4 list-decimal text-gray-700">
                      {renderInline(line.replace(/^\d+\.\s/, ""))}
                    </li>
                  );
                if (line.trim() === "") return <br key={i} />;
                return (
                  <p key={i} className="text-gray-700">
                    {renderInline(line)}
                  </p>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
