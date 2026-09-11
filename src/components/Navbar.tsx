import { GraduationCap, Award, History, LineChart, Shield, LogIn, LogOut, Code } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  userEmail: string | null;
  userName: string | null;
  userPhoto?: string | null;
  onLogout: () => void;
  onLoginClick: () => void;
}

export default function Navbar({
  currentTab,
  setCurrentTab,
  userEmail,
  userName,
  userPhoto,
  onLogout,
  onLoginClick,
}: NavbarProps) {
  const navItems = [
    { id: 'home', label: 'Home', icon: GraduationCap },
    { id: 'resume', label: 'Resume & ATS', icon: Award },
    { id: 'progress', label: 'Progress Hub', icon: LineChart },
    { id: 'about', label: 'Privacy & Trust', icon: Shield },
  ];

  return (
    <nav className="glass-card-dark text-white sticky top-0 z-50 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Brand */}
          <div 
            onClick={() => setCurrentTab('home')} 
            className="flex items-center space-x-3 cursor-pointer group"
            id="nav-logo"
          >
            <div className="bg-albion-gold text-albion-purple p-2 rounded-xl transition-transform duration-300 group-hover:scale-105 shadow-md flex items-center justify-center font-bold">
              <span className="font-display font-black text-xl tracking-tighter">B</span>
            </div>
            <div>
              <span className="font-display font-extrabold text-lg sm:text-xl tracking-tight text-white block leading-none">
                Brit Interview Coach
              </span>
              <span className="text-[10px] text-albion-gold-light tracking-widest font-mono uppercase block mt-1">
                Albion College Career Prep
              </span>
            </div>
          </div>

          {/* Nav Items */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id || (item.id === 'resume' && currentTab === 'resume-edit');
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/15 text-albion-gold border-b-2 border-albion-gold shadow-sm'
                      : 'text-purple-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* User Profile Area */}
          <div className="flex items-center space-x-3">
            {userEmail ? (
              <div className="flex items-center space-x-3">
                <div className="hidden lg:block text-right">
                  <span className="text-xs text-purple-250 block opacity-75">Student Profile</span>
                  <span className="text-sm font-semibold text-white block max-w-[150px] truncate">
                    {userName || userEmail}
                  </span>
                </div>
                {userPhoto ? (
                  <img
                    src={userPhoto}
                    alt={userName || 'Student'}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border-2 border-albion-gold object-cover shadow-sm"
                  />
                ) : (
                  <div className="bg-albion-gold text-albion-purple-dark h-8 w-8 rounded-full flex items-center justify-center font-bold font-display text-sm border-2 border-white/40">
                    {(userName || userEmail)[0].toUpperCase()}
                  </div>
                )}
                <button
                  id="btn-logout"
                  onClick={onLogout}
                  className="bg-white/10 hover:bg-red-950/40 border border-white/15 text-purple-200 hover:text-red-200 p-2 rounded-lg transition-all duration-200 cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2.5">
                <button
                  id="btn-login-trigger"
                  onClick={onLoginClick}
                  className="bg-albion-gold hover:bg-albion-gold-light text-albion-purple-dark px-3.5 py-2 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all duration-200 flex items-center space-x-1.5 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign in with Google</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav Bar tabs footer-style for easy access */}
      <div className="md:hidden border-t border-white/10 h-14 bg-white/5 backdrop-blur-xl flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id || (item.id === 'resume' && currentTab === 'resume-edit');
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] ${
                isActive ? 'text-albion-gold font-bold bg-white/10' : 'text-purple-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
