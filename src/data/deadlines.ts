import type { FilingDeadline } from "../types";

export const filingDeadlines: FilingDeadline[] = [
  // Monthly Sodra contributions
  {
    name: "Sodra įmokos",
    description: "VSD/PSD monthly contributions due",
    month: 0, // every month
    day: 15,
    recurring: "monthly",
  },
  // Quarterly VAT return (FR0600)
  {
    name: "PVM deklaracija (FR0600)",
    description: "Quarterly VAT return filing",
    month: 0,
    day: 25,
    recurring: "quarterly",
  },
  // Quarterly advance GPM payment
  {
    name: "GPM avansinis mokestis",
    description: "Quarterly advance income tax payment",
    month: 0,
    day: 15,
    recurring: "quarterly",
  },
  // Annual income tax return
  {
    name: "Metinė GPM deklaracija (GPM314)",
    description: "Annual personal income tax return",
    month: 5,
    day: 1,
    recurring: "annual",
  },
  // Annual financial statements
  {
    name: "Finansinė atskaitomybė",
    description: "Annual financial statements filing to Registrų centras",
    month: 6,
    day: 30,
    recurring: "annual",
  },
];

export function getUpcomingDeadlines(
  fromDate: Date,
  count: number = 5,
): { deadline: FilingDeadline; date: Date }[] {
  const results: { deadline: FilingDeadline; date: Date }[] = [];
  const year = fromDate.getFullYear();
  const quarterMonths = [1, 4, 7, 10]; // months after quarter end

  for (const dl of filingDeadlines) {
    if (dl.recurring === "monthly") {
      for (let m = fromDate.getMonth(); m < 12; m++) {
        const d = new Date(year, m, dl.day);
        if (d >= fromDate) {
          results.push({ deadline: dl, date: d });
        }
      }
    } else if (dl.recurring === "quarterly") {
      for (const qm of quarterMonths) {
        const d = new Date(year, qm - 1, dl.day);
        if (d >= fromDate) {
          results.push({ deadline: dl, date: d });
        }
      }
    } else if (dl.recurring === "annual") {
      const d = new Date(year, dl.month - 1, dl.day);
      if (d >= fromDate) {
        results.push({ deadline: dl, date: d });
      } else {
        results.push({ deadline: dl, date: new Date(year + 1, dl.month - 1, dl.day) });
      }
    }
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results.slice(0, count);
}
