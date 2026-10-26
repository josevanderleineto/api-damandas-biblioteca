import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, LayoutDashboard, Users, Bell, LogOut, ShieldCheck, User, CalendarOff, Calendar } from 'lucide-react';
import { AusenciaModal } from './AusenciaModal';
import { isUsuarioAusente, formatToDateBr } from '@/lib/ausencia';

export const Navbar = () => {
  const { user, token, logout, isAdmin } = useAuth();
  const pathname = usePathname();
  const [isAusenciaOpen, setIsAusenciaOpen] = useState(false);
  const [ausenciaInfo, setAusenciaInfo] = useState<{
    ausente: boolean;
    ausenteTipo?: string;
    ausenteInicio?: string;
    ausenteFim?: string;
  } | null>(null);

  const fetchAusencia = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/usuarios/me/ausencia', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.ausencia) {
        setAusenciaInfo(data.ausencia);
      }
    } catch (err) {
      // silencioso
    }
  };

  useEffect(() => {
    fetchAusencia();
  }, [token]);

  if (!user) return null;

  const isAusenteAgora = ausenciaInfo?.ausente && isUsuarioAusente(ausenciaInfo);

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin
      ? [
          { href: '/usuarios', label: 'Usuários', icon: Users },
          { href: '/notificacoes', label: 'Disparador & Notificações', icon: Bell },
        ]
      : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 glass-panel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 text-lg leading-tight">Demandas Biblioteca</h1>
              <p className="text-xs text-slate-400 font-medium">UniFTC / UNEX</p>
            </div>
          </div>

          {/* Navigation items */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User profile & actions */}
          <div className="flex items-center gap-2.5">
            {/* Botão de Afastamento / Ausência */}
            <button
              onClick={() => setIsAusenciaOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isAusenteAgora
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:text-sky-300 hover:border-sky-500/30 hover:bg-slate-800/60'
              }`}
              title="Gerenciar período de férias, atestado ou licença"
            >
              {isAusenteAgora ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <CalendarOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">
                    {ausenciaInfo?.ausenteTipo || 'Ausente'} {ausenciaInfo?.ausenteFim ? `(até ${formatToDateBr(ausenciaInfo.ausenteFim)})` : ''}
                  </span>
                  <span className="sm:hidden">Ausente</span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Sinalizar Ausência</span>
                  <span className="sm:hidden">Ausência</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
              {user.role === 'root' || user.role === 'admin' ? (
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              ) : (
                <User className="w-4 h-4 text-indigo-400" />
              )}
              <div className="text-left">
                <span className="font-medium text-slate-200 block">{user.nome}</span>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block font-semibold">{user.role}</span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20"
              title="Sair da Conta"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal de Afastamento */}
      <AusenciaModal
        isOpen={isAusenciaOpen}
        onClose={() => setIsAusenciaOpen(false)}
        onSaved={fetchAusencia}
      />
    </>
  );
};
