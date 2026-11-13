import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthProvider.jsx";
import { ThemeProvider } from "./contexts/ThemeProvider.jsx";
import { initializeTheme } from "./core/theme";

import "./index.css";

import MainLayout from "./layout/MainLayout.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";

import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Home from "./pages/Home.jsx";
import Quotes from "./pages/Quotes.jsx";
import Users from "./pages/Users.jsx";
import CreateQuote from "./pages/CreateQuote.jsx";
import EditQuote from "./pages/EditQuote.jsx";
import VerifyInstructions from "./pages/VerifyInstructions";
import VerifySuccess from "./pages/VerifySuccess";
import VerifyError from "./pages/VerifyError";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Preferences from "./pages/Preferences.jsx";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Habits from "./pages/Habits.jsx";
import CreateHabit from "./pages/CreateHabit.jsx";
import EditHabit from "./pages/EditHabit.jsx";
import ReadingList from "./pages/ReadingList.jsx";
import DailyRoutine from "./pages/DailyRoutine.jsx";
import Dreams from "./pages/Dreams.jsx";
import DreamDetails from "./pages/DreamDetails.jsx";
import Finances from "./pages/Finances.jsx";
import DayManagement from "./pages/DayManagement.jsx";
import Patrimony from "./pages/Patrimony.jsx";
import BankAccounts from "./pages/BankAccounts.jsx";
import BankAccountTransfers from "./pages/BankAccountTransfers.jsx";
import Expenses from "./pages/Expenses.jsx";
import ExpenseCategories from "./pages/ExpenseCategories.jsx";
import ExpensesDashboards from "./pages/ExpensesDashboards.jsx";
import CreditCardSettings from "./pages/CreditCardSettings.jsx";
import PayCreditCardInvoice from "./pages/PayCreditCardInvoice.jsx";
import Investments from "./pages/Investments.jsx";
import InvestmentsDashboards from "./pages/InvestmentsDashboards.jsx";
import InvestmentIncomes from "./pages/InvestmentIncomes.jsx";
import InvestmentIncomesDashboards from "./pages/InvestmentIncomesDashboards.jsx";
import PatrimonyDashboards from "./pages/PatrimonyDashboards.jsx";
import Notes from "./pages/Notes.jsx";
import EntriesVsExpenses from "./pages/EntriesVsExpenses.jsx";
import CreditCards from "./pages/CreditCards.jsx";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    {/* 🔔 Toast global */}
    <Toaster
      position="top-right"
      gutter={12}
      toastOptions={{
        duration: 4000,
        style: {
          fontSize: "14px",
        },
      }}
    />

    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Rotas públicas */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/verify-instructions"
              element={<VerifyInstructions />}
            />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/verify-success" element={<VerifySuccess />} />
            <Route path="/verify-error" element={<VerifyError />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Rotas protegidas */}
            <Route
              element={
                <PrivateRoute>
                  <MainLayout />
                </PrivateRoute>
              }
            >
              <Route path="/home" element={<Home />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/quotes/new" element={<CreateQuote />} />
              <Route path="/quotes/:id/edit" element={<EditQuote />} />
              <Route path="/day-management" element={<DayManagement />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/habits/new" element={<CreateHabit />} />
              <Route path="/habits/:id/edit" element={<EditHabit />} />
              <Route path="/reading-list" element={<ReadingList />} />
              <Route path="/daily-routine" element={<DailyRoutine />} />
              <Route path="/dreams" element={<Dreams />} />
              <Route path="/dreams/:id" element={<DreamDetails />} />
              <Route path="/finances" element={<Finances />} />
              <Route path="/finances/credit-cards" element={<CreditCards />} />
              <Route path="/finances/patrimony" element={<Patrimony />} />
              <Route
                path="/finances/patrimony/accounts"
                element={<BankAccounts />}
              />
              <Route
                path="/finances/transfers"
                element={<BankAccountTransfers />}
              />
              <Route
                path="/finances/patrimony/dashboards"
                element={<PatrimonyDashboards />}
              />
              <Route path="/finances/expenses" element={<Expenses />} />
              <Route
                path="/finances/expenses/categories"
                element={<ExpenseCategories />}
              />
              <Route
                path="/finances/entries-vs-expenses"
                element={<EntriesVsExpenses />}
              />
              <Route
                path="/finances/expenses/pay-invoice"
                element={<PayCreditCardInvoice />}
              />
              <Route
                path="/finances/expenses/dashboards"
                element={<ExpensesDashboards />}
              />
              <Route
                path="/finances/expenses/credit-card-settings"
                element={<CreditCardSettings />}
              />
              <Route path="/finances/investments" element={<Investments />} />
              <Route
                path="/finances/investments/incomes"
                element={<InvestmentIncomes />}
              />
              <Route
                path="/finances/investments/incomes/dashboards"
                element={<InvestmentIncomesDashboards />}
              />
              <Route
                path="/finances/investments/dashboards"
                element={<InvestmentsDashboards />}
              />
              <Route path="/finances/notes" element={<Notes />} />
              <Route path="/preferences" element={<Preferences />} />

              <Route
                path="/users"
                element={
                  <AdminRoute>
                    <Users />
                  </AdminRoute>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </>,
);
