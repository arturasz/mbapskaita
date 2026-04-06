import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { IncomePage } from "./features/income/IncomePage";
import { ExpensesPage } from "./features/expenses/ExpensesPage";
import { VATPage } from "./features/vat/VATPage";
import { CalculatorPage } from "./features/calculator/CalculatorPage";
import { InvestmentsPage } from "./features/investments/InvestmentsPage";
import { GuidesPage } from "./features/guides/GuidesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="income" element={<IncomePage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="vat" element={<VATPage />} />
          <Route path="calculator" element={<CalculatorPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="guides" element={<GuidesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
