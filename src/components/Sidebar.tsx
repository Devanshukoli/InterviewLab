import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Play, 
  History, 
  FileText, 
  TrendingUp, 
  Settings, 
  User, 
  CreditCard, 
  LogOut, 
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';

export type NavTab = 
  | 'dashboard' 
  | 'new-session' 
  | 'active-session' 
  | 'evaluation' 
  | 'history' 
  | 'resumes' 
  | 'progress' 
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  user: UserProfile | null;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenBilling: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  onOpenProfile,
  onOpenBilling,
  isCollapsed = false,
  onToggleCollapse
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new-session', label: 'New Interview', icon: Play },
    { id: 'history', label: 'Interview History', icon: History },
    { id: 'resumes', label: 'Resume Library', icon: FileText },
    { id: 'progress', label: 'Learning Progress', icon: TrendingUp },
    { id: 'settings', label: 'Settings', icon: Settings }
  ] as const;

  return (
    <motion.aside 
      initial={false}
      animate={{
        width: isCollapsed ? 64 : 256
      }}
      transition={{
        type: 'spring',
        stiffness: 350,
        damping: 32,
        mass: 0.8
      }}
      className="border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#09090b] flex flex-col h-full shrink-0 select-none overflow-visible relative z-30 transition-colors duration-200"
    >
      {/* Container with fixed width during animation to avoid layout glitch */}
      <div className={`flex flex-col h-full ${isCollapsed ? 'w-16 items-center' : 'w-64'} transition-all duration-200`}>
        
        {/* App Logo & Toggle Button Header */}
        {isCollapsed ? (
          <div className="h-14 w-full flex items-center justify-center border-b border-zinc-200 dark:border-zinc-800/80 shrink-0">
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all cursor-pointer relative group active:scale-95"
                title="Open sidebar (⌘\)"
              >
                <PanelLeftOpen className="w-5 h-5" />
                <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium px-2.5 py-1.5 rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-zinc-800 dark:border-zinc-200">
                  Open sidebar (⌘\)
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 shrink-0 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center shadow-xs shrink-0">
                <div className="w-3.5 h-3.5 bg-white dark:bg-black rotate-45"></div>
              </div>
              <div className="min-w-0">
                <span className="font-bold tracking-tight text-sm block text-zinc-900 dark:text-white font-sans truncate">InterviewOps</span>
                <span className="text-[10px] text-zinc-500 font-mono tracking-wider block truncate">AI INTERVIEW PREP</span>
              </div>
            </div>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all cursor-pointer relative group shrink-0 active:scale-95"
                title="Close sidebar (⌘\)"
              >
                <PanelLeftClose className="w-4 h-4" />
                <span className="absolute left-full ml-2 top-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-mono font-medium px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Close sidebar (⌘\)
                </span>
              </button>
            )}
          </div>
        )}

        {/* Main Navigation */}
        {isCollapsed ? (
          <nav className="flex-1 py-4 flex flex-col items-center gap-2 overflow-y-auto px-2 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => setActiveTab(item.id as NavTab)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                      isActive
                        ? 'bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>

                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium px-2.5 py-1.5 rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-zinc-800 dark:border-zinc-200">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </nav>
        ) : (
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto w-full">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-3 mb-2 font-mono">
              Menu
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as NavTab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 dark:bg-zinc-800 text-white font-semibold shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* User Avatar Profile Footer */}
        <div className={`border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#0a0a0d] relative w-full ${isCollapsed ? 'p-2 flex justify-center' : 'p-3'}`} ref={menuRef}>
          
          {/* Dropdown Popup Menu */}
          {menuOpen && (
            <div 
              className={
                isCollapsed
                  ? "absolute bottom-2 left-16 w-56 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-1.5 space-y-1 z-50 animate-fadeIn"
                  : "absolute bottom-16 left-3 right-3 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl p-1.5 space-y-1 z-50 animate-fadeIn"
              }
            >
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/80 mb-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                  {user?.name || 'Devanshu Koli'}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">
                  {user?.email || 'architect@interviewops.io'}
                </p>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfile();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer text-left"
              >
                <User className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Profile</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer text-left"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Settings</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenBilling();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer text-left"
              >
                <CreditCard className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <div className="flex items-center justify-between w-full">
                  <span>Billing</span>
                  <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono px-1.5 py-0.5 rounded">SOON</span>
                </div>
              </button>

              <div className="border-t border-zinc-200 dark:border-zinc-800/80 my-1"></div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer text-left"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                <span>Log out</span>
              </button>
            </div>
          )}

          {/* User Button */}
          {isCollapsed ? (
            <div className="relative group">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:ring-2 hover:ring-zinc-400 dark:hover:ring-zinc-700 transition-all cursor-pointer active:scale-95"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-800" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-xs font-bold text-white uppercase shrink-0">
                    {user?.name ? user.name.substring(0, 2).toUpperCase() : 'DK'}
                  </div>
                )}
              </button>
              {!menuOpen && (
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium px-2.5 py-1.5 rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-zinc-800 dark:border-zinc-200">
                  {user?.name || 'Account & Settings'}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-800" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-xs font-bold text-white uppercase shrink-0">
                    {user?.name ? user.name.substring(0, 2).toUpperCase() : 'DK'}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">{user?.name || 'Devanshu Koli'}</span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-500 font-mono truncate">{user?.email || 'architect@interviewops.io'}</span>
                </div>
              </div>
              <ChevronUp className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
          )}

        </div>

      </div>
    </motion.aside>
  );
}
