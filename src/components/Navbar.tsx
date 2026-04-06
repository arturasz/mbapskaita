import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/income", label: "Pajamos" },
  { to: "/expenses", label: "Išlaidos" },
  { to: "/vat", label: "PVM" },
  { to: "/calculator", label: "Skaičiuoklė" },
  { to: "/investments", label: "Investicijos" },
  { to: "/guides", label: "Gidai" },
];

export function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <NavLink to="/" className="py-4 text-lg font-bold text-gray-900">
          MB Apskaita
        </NavLink>
        <div className="flex gap-1 overflow-x-auto">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
