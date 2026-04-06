import type { ExpenseCategory } from "../types";

export interface ExpenseCategoryInfo {
  key: ExpenseCategory;
  label: string;
  labelLt: string;
  vatDeductible: boolean;
  description: string;
}

export const expenseCategories: ExpenseCategoryInfo[] = [
  {
    key: "office",
    label: "Office",
    labelLt: "Biuras",
    vatDeductible: true,
    description: "Rent, utilities, office supplies",
  },
  {
    key: "equipment",
    label: "Equipment",
    labelLt: "Įranga",
    vatDeductible: true,
    description: "Computers, peripherals, furniture",
  },
  {
    key: "software",
    label: "Software",
    labelLt: "Programinė įranga",
    vatDeductible: true,
    description: "SaaS subscriptions, licenses",
  },
  {
    key: "travel",
    label: "Travel",
    labelLt: "Kelionės",
    vatDeductible: true,
    description: "Business travel, accommodation",
  },
  {
    key: "communication",
    label: "Communication",
    labelLt: "Ryšiai",
    vatDeductible: true,
    description: "Phone, internet, postal",
  },
  {
    key: "banking",
    label: "Banking",
    labelLt: "Bankininkystė",
    vatDeductible: false,
    description: "Bank fees, currency conversion",
  },
  {
    key: "professional_services",
    label: "Professional Services",
    labelLt: "Profesinės paslaugos",
    vatDeductible: true,
    description: "Accounting, legal, consulting",
  },
  {
    key: "other",
    label: "Other",
    labelLt: "Kita",
    vatDeductible: false,
    description: "Miscellaneous business expenses",
  },
];
