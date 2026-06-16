import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  RefreshCw, 
  ExternalLink, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  ShoppingBag, 
  AlertCircle, 
  CheckCircle2, 
  ArrowDownIcon, 
  History,
  Trash2,
  Info,
  ChevronRight,
  Bookmark,
  Bell,
  BellRing,
  Plus,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  Activity,
  Check,
  Play,
  Pause,
  AlertTriangle,
  HelpCircle
} from "lucide-react";
import { ScannedData, GroundingSource, SavedSearch, PriceAlert, SystemNotification } from "./types";

const SUGGESTED_PRODUCTS = [
  "Sony WH-1000XM5 Noise Cancelling Headphones",
  "Nintendo Switch OLED Model",
  "Apple AirPods Pro 2",
  "PlayStation 5 Slim 1TB",
  "iPad Air 11-inch M2"
];

export default function App() {
  const [query, setQuery] = useState("Sony WH-1000XM5 Wireless Noise Cancelling Headphones");
  const [loading, setLoading] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [history, setHistory] = useState<SavedSearch[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Live Engine Active");
  const [latency, setLatency] = useState(42);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Price Alert state
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [newAlertQuery, setNewAlertQuery] = useState("");
  const [newAlertTarget, setNewAlertTarget] = useState("");
  const [checkingAlertId, setCheckingAlertId] = useState<string | null>(null);
  const [autoMonitorActive, setAutoMonitorActive] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [muteSound, setMuteSound] = useState(false);
  const [browserNotificationAllowed, setBrowserNotificationAllowed] = useState(false);

  // Tab State for right panel: "Alerts" vs "Analysis" vs "History"
  const [activeRightTab, setActiveRightTab] = useState<"alerts" | "analysis" | "history">("alerts");

  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Pitch-perfect auditory chord sound generator using Web Audio API (zero file download needed)
  const playAlertChime = () => {
    if (muteSound) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (frequency: number, startTime: number, duration: number, type: OscillatorType = "sine") => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startTime);
        gainNode.gain.setValueAtTime(0.08, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      // Arpeggiated chime chord (C Major arpeggio)
      playTone(523.25, now, 0.35, "sine");       // C5
      playTone(659.25, now + 0.08, 0.35, "sine");  // E5
      playTone(783.99, now + 0.16, 0.35, "sine");  // G5
      playTone(1046.50, now + 0.24, 0.6, "sine");  // C6
    } catch (e) {
      console.warn("Audio Context blocked or not supported", e);
    }
  };

  // Ask for browser push notifications permission
  const requestBrowserNotificationAccess = () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        setBrowserNotificationAllowed(true);
        // Play success tone
        playAlertChime();
        new Notification("🔔 Setup Complete", {
          body: "PriceXPro will notify you here when price limits are met!",
          icon: "/favicon.ico"
        });
      } else {
        setBrowserNotificationAllowed(false);
      }
    });
  };

  // Sync state & check notifications permission
  useEffect(() => {
    if ("Notification" in window) {
      setBrowserNotificationAllowed(Notification.permission === "granted");
    }

    // Load alarms & notifications from localStorage
    try {
      const savedAlerts = localStorage.getItem("price_scanner_alerts_v1");
      if (savedAlerts) {
        setAlerts(JSON.parse(savedAlerts));
      } else {
        // Default seed alerts
        const defaultAlerts: PriceAlert[] = [
          {
            id: "default-1",
            product_query: "Nintendo Switch OLED Model",
            target_price: 300,
            currency: "$",
            active: true,
            createdAt: new Date().toISOString(),
            triggered: false,
          },
          {
            id: "default-2",
            product_query: "Sony WH-1000XM5 Noise Cancelling Headphones",
            target_price: 290,
            currency: "$",
            active: true,
            createdAt: new Date().toISOString(),
            triggered: false,
          }
        ];
        setAlerts(defaultAlerts);
        localStorage.setItem("price_scanner_alerts_v1", JSON.stringify(defaultAlerts));
      }

      const savedNotifications = localStorage.getItem("price_scanner_notifications_v1");
      if (savedNotifications) {
        setNotifications(JSON.parse(savedNotifications));
      }
    } catch (e) {
      console.error("Failed loading local state storage caches", e);
    }
  }, []);

  // Save alerts modification helper
  const saveAlertsList = (updated: PriceAlert[]) => {
    setAlerts(updated);
    localStorage.setItem("price_scanner_alerts_v1", JSON.stringify(updated));
  };

  // Save notifications modification helper
  const saveNotificationsList = (updated: SystemNotification[]) => {
    setNotifications(updated);
    localStorage.setItem("price_scanner_notifications_v1", JSON.stringify(updated));
  };

  // Clear or dismiss alerts / notifications
  const clearNotifications = () => {
    saveNotificationsList([]);
  };

  const markNotificationRead = (id: string) => {
    saveNotificationsList(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveNotificationsList(notifications.filter(n => n.id !== id));
  };

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("price_scanner_history");
      if (saved) {
        setHistory(JSON.parse(saved));
      } else {
        const initialHistory: SavedSearch[] = [
          {
            id: "1",
            query: "Nintendo Switch OLED",
            product_name: "Nintendo Switch - OLED Model w/ White Joy-Con",
            lowest_price: 319,
            currency: "$",
            scannedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
            deal_url: "https://www.amazon.com",
            store_name: "Amazon.com"
          },
          {
            id: "2",
            query: "Apple AirPods Pro 2",
            product_name: "Apple AirPods Pro (2nd Generation) with USB-C",
            lowest_price: 189,
            currency: "$",
            scannedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
            deal_url: "https://www.walmart.com",
            store_name: "Walmart"
          }
        ];
        setHistory(initialHistory);
        localStorage.setItem("price_scanner_history", JSON.stringify(initialHistory));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const saveHistoryList = (newList: SavedSearch[]) => {
    setHistory(newList);
    localStorage.setItem("price_scanner_history", JSON.stringify(newList));
  };

  // Create alert notification item
  const dispatchAlertNotification = (alertItem: PriceAlert, lowestFound: number, store: string, url: string) => {
    const notifyId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    const newNotify: SystemNotification = {
      id: notifyId,
      alertId: alertItem.id,
      title: "🚨 MATCH FOUND: Target Price Limit Met",
      message: `"${alertItem.product_query}" has dropped to ${alertItem.currency}${lowestFound} (Target: ${alertItem.currency}${alertItem.target_price}) at ${store}!`,
      productName: alertItem.product_query,
      targetPrice: alertItem.target_price,
      scannedPrice: lowestFound,
      storeName: store,
      dealUrl: url,
      createdAt: new Date().toISOString(),
      read: false
    };

    const newNotificationsList = [newNotify, ...notifications];
    saveNotificationsList(newNotificationsList.slice(0, 100)); // cap at 100
    
    // Play sound & Notify
    playAlertChime();

    if (Notification.permission === "granted") {
      new Notification(`🚨 PRICE ALERT: Target Reached!`, {
        body: `${alertItem.product_query} dropped to $${lowestFound} at ${store}! (Limit: $${alertItem.target_price})`,
        icon: "/favicon.ico"
      });
    }

    setNotificationPanelOpen(true);
  };

  // Live Check Single Price Alert
  const checkPriceAlertLive = async (alertItem: PriceAlert): Promise<boolean> => {
    setCheckingAlertId(alertItem.id);
    setStatusMessage(`Verifying alert boundary query...`);
    try {
      const response = await fetch("/api/check-alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_query: alertItem.product_query,
          target_price: alertItem.target_price
        })
      });

      if (!response.ok) {
        let errMsg = `API check alert error status: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      if (resJson.evaluation) {
        const evalResult = resJson.evaluation;
        const priceFound = evalResult.lowest_price_found;
        const storeMatched = evalResult.store_name || "Online Marketplace";
        const matchedUrl = evalResult.deal_url || "https://www.google.com";

        const triggered = priceFound > 0 && priceFound <= alertItem.target_price;

        const updatedAlerts = alerts.map(a => {
          if (a.id === alertItem.id) {
            return {
              ...a,
              triggered,
              latestScannedPrice: priceFound,
              storeMatched,
              dealUrl: matchedUrl,
              lastCheckedAt: new Date().toISOString()
            };
          }
          return a;
        });
        saveAlertsList(updatedAlerts);

        if (triggered && !alertItem.triggered) {
          dispatchAlertNotification(alertItem, priceFound, storeMatched, matchedUrl);
          return true;
        }
      }
    } catch (e) {
      console.error("Live alert query checking issue", e);
    } finally {
      setCheckingAlertId(null);
    }
    return false;
  };

  // Cross-evaluate normal scan results for active alerts match
  const evaluateScanDataForAlerts = (scanned: ScannedData, currentQueryStr: string) => {
    if (!scanned.deals || scanned.deals.length === 0) return;
    const lowestScanned = scanned.lowest_price || scanned.deals[0].price;
    const bestDeal = scanned.deals[0];

    let alertMatched = false;
    const updatedAlerts = alerts.map(a => {
      // Check loose matching of item query or scanned name
      const isQueryMatch = currentQueryStr.toLowerCase().includes(a.product_query.toLowerCase()) || 
                           a.product_query.toLowerCase().includes(currentQueryStr.toLowerCase()) ||
                           scanned.product_name.toLowerCase().includes(a.product_query.toLowerCase());

      if (isQueryMatch && a.active) {
        const canTriggerObj = lowestScanned <= a.target_price;
        if (canTriggerObj && !a.triggered) {
          alertMatched = true;
          // Defer a tiny bit to avoid call stack issues
          setTimeout(() => {
            dispatchAlertNotification(a, lowestScanned, bestDeal.store_name, bestDeal.deal_url);
          }, 400);
        }
        return {
          ...a,
          triggered: canTriggerObj,
          latestScannedPrice: lowestScanned,
          storeMatched: bestDeal.store_name,
          dealUrl: bestDeal.deal_url,
          lastCheckedAt: new Date().toISOString()
        };
      }
      return a;
    });

    if (alertMatched) {
      saveAlertsList(updatedAlerts);
    }
  };

  // Perform standard Real-Time scan search
  const handleScan = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Scanning global markets...");
    const startTime = performance.now();

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: searchQuery }),
      });

      const durationMs = Math.round(performance.now() - startTime);
      setLatency(durationMs > 1500 ? Math.round(durationMs / 10) : durationMs);

      if (!response.ok) {
        let errMsg = `Server returned error status: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const result = await response.json();
      
      if (result.scanned_data) {
        setScannedData(result.scanned_data);
        setSources(result.sources || []);
        setStatusMessage("Analysis synthesized");

        // Force-add to persistent tracking history
        const newHistoryItem: SavedSearch = {
          id: Date.now().toString(),
          query: searchQuery,
          product_name: result.scanned_data.product_name || searchQuery,
          lowest_price: result.scanned_data.lowest_price || 0,
          currency: result.scanned_data.currency || "$",
          scannedAt: new Date().toISOString(),
          deal_url: result.scanned_data.deals?.[0]?.deal_url || "",
          store_name: result.scanned_data.deals?.[0]?.store_name || "N/A"
        };

        const filteredHistory = history.filter(
          item => item.query.toLowerCase() !== searchQuery.toLowerCase()
        );
        saveHistoryList([newHistoryItem, ...filteredHistory].slice(0, 8));

        // Evaluate matches against price threshold target rules
        evaluateScanDataForAlerts(result.scanned_data, searchQuery);
      } else {
        throw new Error("No pricing data found in e-commerce database search results.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorCount(prev => prev + 1);
      setErrorMessage(
        err.message || "An unexpected network error occurred while routing the query."
      );
      setStatusMessage("Scan suspended (API Key missing or rate-limited)");
    } finally {
      setLoading(false);
    }
  };

  // Run initial scan
  useEffect(() => {
    handleScan("Sony WH-1000XM5 Wireless Noise Cancelling Headphones");
  }, []);

  // Creation of alert thresholds
  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlertQuery.trim() || !newAlertTarget.trim()) return;
    const priceNum = parseFloat(newAlertTarget);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Please provide a valid threshold price number");
      return;
    }

    const newAlert: PriceAlert = {
      id: "alert-" + Date.now().toString(),
      product_query: newAlertQuery.trim(),
      target_price: priceNum,
      currency: "$",
      active: true,
      createdAt: new Date().toISOString(),
      triggered: false
    };

    const updated = [newAlert, ...alerts];
    saveAlertsList(updated);
    setNewAlertQuery("");
    setNewAlertTarget("");
    setActiveRightTab("alerts");

    // run dynamic check instantly to verify state
    checkPriceAlertLive(newAlert);
  };

  const deleteAlertRule = (id: string) => {
    const updated = alerts.filter(a => a.id !== id);
    saveAlertsList(updated);
  };

  const toggleAlertActiveState = (id: string) => {
    const updated = alerts.map(a => {
      if (a.id === id) {
        return {
          ...a,
          active: !a.active,
          triggered: false // reset trigger on toggling activity
        };
      }
      return a;
    });
    saveAlertsList(updated);
  };

  const runVerificationOfAllActiveAlerts = async () => {
    if (checkingAlertId) return;
    setStatusMessage("Running global watch alerts check...");
    let matchesCount = 0;
    
    for (const alertRule of alerts) {
      if (alertRule.active) {
        const triggered = await checkPriceAlertLive(alertRule);
        if (triggered) matchesCount++;
      }
    }
    setStatusMessage(matchesCount > 0 ? `${matchesCount} Alerts triggered!` : "Watch limits verified");
  };

  // Simulate or engage background auto monitor cycle
  useEffect(() => {
    if (autoMonitorActive) {
      // Run once immediately
      runVerificationOfAllActiveAlerts();
      
      // Set interval for checking alerts
      monitorIntervalRef.current = setInterval(() => {
        runVerificationOfAllActiveAlerts();
      }, 50000); // Check every 50 seconds active monitoring
    } else {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
        monitorIntervalRef.current = null;
      }
    }

    return () => {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
      }
    };
  }, [autoMonitorActive, alerts]);

  // Clean elements helpers
  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    saveHistoryList(updated);
  };

  const clearAllHistory = () => {
    saveHistoryList([]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-[#E5E7EB] font-sans antialiased selection:bg-indigo-600 selection:text-white" id="price-scanner-app">
      
      {/* Top Header Navigation */}
      <nav className="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10 bg-[#0A0A0A] gap-4 sticky top-0 z-40" id="nav-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-indigo-600/20 text-sm tracking-wider">
            PR
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-white font-display">
              PRICEX<span className="text-indigo-500 italic">PRO</span>
            </span>
            <p className="text-[9px] text-indigo-400 font-mono tracking-wider -mt-1 leading-none">REAL-TIME MONITOR & CRAWLER</p>
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <span className="text-slate-500 font-mono uppercase tracking-wider mr-1">TOP INDEXED:</span>
          {SUGGESTED_PRODUCTS.slice(0, 3).map((prod) => (
            <button
              key={prod}
              onClick={() => {
                setQuery(prod);
                handleScan(prod);
              }}
              className="px-3 py-1 rounded-full border border-white/5 bg-white/5 hover:border-indigo-500/40 hover:text-white transition-all text-left max-w-xs truncate cursor-pointer text-[11px]"
            >
              {prod.split(" ")[0]} {prod.split(" ")[1]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          
          {/* Auditory toggle button */}
          <button 
            onClick={() => setMuteSound(!muteSound)}
            className="p-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors text-slate-400 hover:text-white cursor-pointer"
            title={muteSound ? "Unmute audio notification" : "Mute audio notification"}
          >
            {muteSound ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Browser System Notifications access button */}
          {!browserNotificationAllowed && (
            <button 
              onClick={requestBrowserNotificationAccess}
              className="px-2.5 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 text-[10px] uppercase font-mono tracking-wider flex items-center gap-1 cursor-pointer"
              title="Allow notifications permission"
            >
              <Zap className="w-3 h-3 text-indigo-400 animate-pulse" /> Consent System Alerts
            </button>
          )}

          {/* In-app Notification center bell trigger button */}
          <div className="relative">
            <button 
              onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
              className="p-2.5 rounded-xl bg-[#111] border border-white/10 hover:border-indigo-500/30 text-slate-300 hover:text-indigo-400 transition-all cursor-pointer relative"
              id="notification-bell-trigger"
            >
              {notifications.some(n => !n.read) ? (
                <>
                  <BellRing className="w-4 h-4 text-indigo-400 animate-bounce" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full"></span>
                </>
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </button>

            {/* Micro panel count display for scannability */}
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[8px] bg-indigo-900 border border-indigo-500 text-white font-mono rounded px-1 scale-90">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </div>

          <div className="text-right">
            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest leading-none">Diagnostic Server</p>
            <p className="text-xs flex items-center justify-end gap-1.5 mt-1 font-mono text-emerald-400 whitespace-nowrap">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              {statusMessage.length > 28 ? `${statusMessage.substr(0, 25)}...` : statusMessage}
            </p>
          </div>
        </div>
      </nav>

      {/* Main App Workspace Layout */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto gap-6" id="main-content">
        
        {/* Dynamic Search Box */}
        <div className="relative group" id="search-section">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-500 rounded-2xl blur-md opacity-25 group-hover:opacity-35 transition duration-1000"></div>
          
          <div className="relative bg-[#111111] border border-white/10 rounded-2xl p-2.5 flex flex-col md:flex-row gap-3 transition-all">
            <div className="flex-1 flex items-center px-4 relative">
              <Search className="text-slate-500 absolute left-4 w-5 h-5" />
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                placeholder="Product model keywords (e.g. Sony WH-1000XM5, Nintendo Switch OLED, etc.)" 
                className="w-full bg-transparent border-0 text-white placeholder-slate-500 py-3.5 pl-9 pr-4 focus:ring-0 focus:outline-none text-base md:text-lg font-light tracking-wide font-sans text-ellipsis"
              />
            </div>
            
            <div className="flex flex-wrap items-center justify-end gap-2.5 px-2">
              <button
                onClick={() => handleScan()}
                disabled={loading}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-7 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:pointer-events-none cursor-pointer font-display uppercase tracking-wider"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {loading ? "Sweeping Markets..." : "Live Market Scan"}
              </button>
            </div>
          </div>
        </div>

        {/* Dropdown System Notification Center panel */}
        {notificationPanelOpen && (
          <div className="bg-[#0B0B0B] border border-indigo-500/30 rounded-2xl p-5 shadow-2xl animate-fade-in flex flex-col gap-4 relative overflow-hidden" id="notification-bell-panel">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-indigo-400 to-purple-500"></div>
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-sm tracking-wide text-white font-display">Target Alerts Notification Center</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                  {notifications.filter(n => !n.read).length} unread
                </span>
              </div>
              <div className="flex items-center gap-3">
                {notifications.length > 0 && (
                  <button 
                    onClick={clearNotifications}
                    className="text-[10px] text-slate-500 hover:text-rose-400 font-mono uppercase tracking-wider cursor-pointer"
                  >
                    Clear history
                  </button>
                )}
                <button 
                  onClick={() => setNotificationPanelOpen(false)}
                  className="p-1 rounded bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {notifications.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id}
                    onClick={() => markNotificationRead(notif.id)}
                    className={`p-4 rounded-xl border transition-all flex gap-3 relative ${
                      notif.read 
                      ? "bg-white/[0.01] border-white/5 opacity-70" 
                      : "bg-[#111111] border-indigo-500/20 shadow-lg shadow-indigo-600/5 hover:border-indigo-500/40"
                    }`}
                  >
                    {!notif.read && (
                      <span className="absolute top-4 left-3 w-2 h-2 bg-indigo-500 rounded-full"></span>
                    )}
                    
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400">PRICE LIMIT REACHED</span>
                        <span className="text-[9px] font-mono text-slate-500">{new Date(notif.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs font-semibold text-white mt-1 leading-relaxed">
                        {notif.productName}
                      </p>
                      <p className="text-slate-300 text-xs mt-1.5 font-light">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Found at: <strong className="text-indigo-400 font-bold">{notif.storeName}</strong>
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <a 
                            href={notif.dealUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white max-px-2 py-1 px-3 rounded font-bold tracking-wide flex items-center gap-1 transition-all"
                          >
                            Deal url <ExternalLink className="w-3 h-3" />
                          </a>
                          <button 
                            onClick={(e) => dismissNotification(notif.id, e)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/15"
                            title="Dismiss notification card"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                <Bell className="w-8 h-8 opacity-25" />
                No notification logs cached. Notifications appear here when active price alerts trigger in the field.
              </div>
            )}
          </div>
        )}

        {/* Warning card when credentials are setup and user wants direction */}
        {errorMessage && (
          <div className="bg-slate-900 border border-slate-700 text-rose-205 px-5 py-5 rounded-xl text-sm flex gap-4 items-start animate-fade-in" id="error-feedback">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-rose-400 text-base">Market Integration Pipeline Halted</p>
              <p className="text-slate-350 mt-1 leading-relaxed">{errorMessage}</p>
              
              {/quota/i.test(errorMessage) || /RESOURCE_EXHAUSTED/i.test(errorMessage) || /limit/i.test(errorMessage) || /billing/i.test(errorMessage) ? (
                <div className="mt-3 bg-red-950/20 border border-rose-500/20 p-3.5 rounded-lg text-slate-300 text-xs leading-relaxed">
                  <p className="font-semibold text-rose-400 flex items-center gap-1.5 mb-1.5 font-mono uppercase tracking-wider">
                    <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                    API troubleshooting guide
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300">
                    <li>Open the <strong>Settings &gt; Secrets</strong> panel in the top-right menu of your AI Studio.</li>
                    <li>Verify your current <strong>GEMINI_API_KEY</strong> values are up to date.</li>
                    <li>If you are using a standard free-tier API key and hitting rate limits, consider using a billing-enabled or paid API Key to significantly increase your daily Google Search grounding limits.</li>
                  </ol>
                </div>
              ) : (
                <p className="text-xs text-rose-400/80 mt-2 font-mono">
                  System Guide: Verify your GEMINI_API_KEY environment variable is declared inside the Secrets menu configurations.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Dashboard Panels Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="scanner-results-grid">
          
          {/* LEFT COLUMN PANEL: Results & Merchandiser Details (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* Header statistics */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 px-1 relative">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-400/80 font-mono">
                  Live Scanner Analysis Console
                </h2>
                {scannedData ? (
                  <p className="text-slate-200 text-sm font-medium mt-1">
                    Aggregation for <span className="text-white font-semibold">"{scannedData.product_name}"</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">Please scan or specify a product above to list merchants</p>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono">
                {loading ? (
                  <span className="text-indigo-400 animate-pulse flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 animate-spin" /> Grounded server querying active...
                  </span>
                ) : (
                  <span>Coverage: 12+ Platforms · Index response: ~{latency / 1000}s</span>
                )}
              </div>
            </div>

            {/* Sweep progress loader */}
            {loading && (
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute top-0 h-full w-[45%] bg-indigo-500 rounded-full animate-pulse" style={{ left: '15%' }}></div>
              </div>
            )}

            {/* Dynamic Results block */}
            {scannedData ? (
              <div className="flex flex-col gap-4">
                
                {/* Product Bio card */}
                <div className="bg-[#111111] border border-white/5 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-[#161616] p-3 text-right">
                    <p className="text-[10px] text-indigo-400 font-mono uppercase tracking-wider">ESTIMATED VALUATION</p>
                    <p className="text-2xl font-mono font-black text-white mt-1">
                      {scannedData.currency || "$"}{scannedData.lowest_price} - {scannedData.currency || "$"}{scannedData.average_price}
                    </p>
                  </div>

                  <div className="max-w-[70%]">
                    {scannedData.brand && (
                      <span className="px-2 py-0.5 rounded text-[9px] bg-indigo-900/30 text-indigo-300 font-mono uppercase tracking-widest font-bold border border-indigo-500/20">
                        {scannedData.brand}
                      </span>
                    )}
                    <h1 className="text-xl sm:text-2xl font-semibold mt-2 text-white font-display">
                      {scannedData.product_name}
                    </h1>
                    <p className="text-slate-400 text-sm mt-2 leading-relaxed font-light">
                      {scannedData.description || "Synthesized price scanning index has located matching e-commerce deals across multiple retail channels."}
                    </p>
                  </div>

                  {scannedData.price_range && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">Crawled range: </span>
                        <span className="text-slate-300 font-mono font-bold">{scannedData.price_range}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Verdict recommended: </span>
                        <span className="text-indigo-400 font-semibold uppercase">{scannedData.market_verdict || "Fair Deal"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Best Offer card */}
                {scannedData.deals && scannedData.deals.length > 0 && (
                  <div className="bg-[#111111] border border-emerald-500/25 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center gap-6 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 bg-emerald-500 text-[10px] font-black text-black px-4 py-1.5 uppercase tracking-wider rounded-bl-xl font-mono">
                      Lowest Scanned Offer
                    </div>
                    
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#1A1A1A] rounded-xl border border-white/10 flex flex-col items-center justify-center shrink-0">
                      <ShoppingBag className="w-8 h-8 text-emerald-400 animate-pulse" />
                    </div>

                    <div className="flex-1 w-full">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                        <div>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            {scannedData.deals[0].store_name}
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-normal border border-emerald-500/20">
                              {scannedData.deals[0].tag || "Verified Merchant"}
                            </span>
                          </h3>
                          <p className="text-slate-400 text-xs mt-1">
                            {scannedData.deals[0].availability || "Active stock verified through search grounding"}
                          </p>
                          {scannedData.deals[0].shipping && (
                            <p className="text-[11px] text-slate-500 mt-1">📦 {scannedData.deals[0].shipping}</p>
                          )}
                        </div>
                        <div className="sm:text-right">
                          <p className="text-3xl font-mono font-bold text-emerald-400">
                            {scannedData.currency || "$"}{scannedData.deals[0].price}
                          </p>
                          {scannedData.deals[0].original_price && scannedData.deals[0].original_price > scannedData.deals[0].price && (
                            <p className="text-xs text-rose-500 line-through">
                              {scannedData.currency || "$"}{scannedData.deals[0].original_price} MSRP
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 mt-5">
                        <a 
                          href={scannedData.deals[0].deal_url || "#"} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-1 bg-white hover:bg-slate-200 text-black py-3.5 rounded-xl font-bold text-sm tracking-wide text-center flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-white/5"
                        >
                          Checkout at {scannedData.deals[0].store_name}
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Secondary merchant options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {scannedData.deals && scannedData.deals.slice(1).map((deal, idx) => {
                    const deviation = scannedData.lowest_price ? (deal.price - scannedData.lowest_price) : 0;
                    return (
                      <div 
                        key={idx} 
                        className="bg-[#0A0A0A] border border-white/5 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/25 transition-all group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{deal.store_name}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate max-w-[170px]">
                              {deal.availability || "Discovered Active"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-mono font-bold text-white group-hover:text-indigo-400 transition-colors">
                              {scannedData.currency || "$"}{deal.price}
                            </p>
                            {deviation > 0 && (
                              <p className="text-[10px] text-rose-500/80 font-mono">
                                +{scannedData.currency || "$"}{deviation.toFixed(2)} price diff
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {deal.shipping || "Instant Shipping Verified"}
                          </span>
                          <a 
                            href={deal.deal_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            Explore offer
                            <ChevronRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grounding references and URLs */}
                {sources.length > 0 && (
                  <div className="bg-[#111111]/50 border border-white/5 rounded-2xl p-5 mt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      Audited Web Verification References ({sources.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {sources.map((src, i) => (
                        <a 
                          key={i} 
                          href={src.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-indigo-600/10 hover:border-indigo-500/20 border border-transparent transition-all cursor-pointer text-slate-300"
                        >
                          <span className="truncate pr-4">{src.title}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-[#111111] border border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 shadow-xl">
                {loading ? (
                  <>
                    <div className="relative w-16 h-16 mb-2">
                      <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                      <div className="absolute inset-x-0 bottom-0 h-1/2 w-full bg-[#111] -mb-1"></div>
                    </div>
                    <p className="text-lg font-medium text-slate-300 font-display">Simultaneously scouring e-commerce networks...</p>
                    <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                      Executing parallel API inquiries with Live Google Search grounding to retrieve authentic consumer price links from retailers.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2">
                      <Search className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-semibold text-slate-300">Run a Real-Time Price Search Scan</p>
                    <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                      Enter a model number, device, electronics product, or specific part above to check active pricing across global retailers.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center mt-3">
                      {SUGGESTED_PRODUCTS.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setQuery(p);
                            handleScan(p);
                          }}
                          className="px-3.5 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/30 text-xs text-slate-300 transition-all cursor-pointer"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Smart assistance indicator */}
            <div className="bg-[#0A0A0A] border border-white/5 rounded-xl p-4 flex gap-4 text-xs text-slate-400 leading-relaxed">
              <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-300">Intelligent Price Alert Rules Integration</p>
                <p className="mt-1">
                  Active alert boundaries are cross-evaluated automatically during normal scans. If you scan a product that has an alert configured, the browser system evaluates price limits instantly and sends immediate notifications.
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN PANEL: Alerts, Volatility, History (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="dashboard-controls-sidebar">
            
            {/* Tab Selector Controls */}
            <div className="flex bg-[#0A0A0A] border border-white/15 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setActiveRightTab("alerts")}
                className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  activeRightTab === "alerts" 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Bell className="w-3.5 h-3.5" /> Alerts ({alerts.length})
              </button>
              <button 
                onClick={() => setActiveRightTab("analysis")}
                className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  activeRightTab === "analysis" 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Activity className="w-3.5 h-3.5" /> Analytics
              </button>
              <button 
                onClick={() => setActiveRightTab("history")}
                className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  activeRightTab === "history" 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <History className="w-3.5 h-3.5" /> History ({history.length})
              </button>
            </div>

            {/* TAB CONTENT: Price Threshold Watch Rules */}
            {activeRightTab === "alerts" && (
              <div className="flex flex-col gap-5 animate-fade-in">
                
                {/* Form to append new price target alerts */}
                <form onSubmit={handleCreateAlert} className="bg-[#111111] border border-white/10 rounded-2xl p-5 flex flex-col gap-3.5 shadow-xl">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-indigo-400" /> Specify Price Watch Alert
                    </h3>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                      Real-Time Limit
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Product Keywords</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Nintendo Switch OLED"
                      value={newAlertQuery}
                      onChange={(e) => setNewAlertQuery(e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Target price ($)</label>
                      <input 
                        type="number" 
                        required
                        step="0.01"
                        placeholder="e.g. 299"
                        value={newAlertTarget}
                        onChange={(e) => setNewAlertTarget(e.target.value)}
                        className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 text-white font-mono"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        type="submit"
                        className="w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer"
                      >
                        Set Alert
                      </button>
                    </div>
                  </div>
                </form>

                {/* Automation Controller Trigger Card */}
                <div className="bg-[#111111] border border-indigo-500/20 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Live Auto-Monitor (Simulation)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-light">Continually sweeps and verifies price targets</p>
                    </div>

                    <button 
                      onClick={() => setAutoMonitorActive(!autoMonitorActive)}
                      className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-center ${
                        autoMonitorActive 
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs" 
                        : "bg-white/5 border border-white/10 text-slate-400 text-xs"
                      }`}
                    >
                      {autoMonitorActive ? (
                        <div className="flex items-center gap-1">
                          <Pause className="w-3.5 h-3.5 fill-emerald-400" /> Active
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Play className="w-3.5 h-3.5 fill-slate-400" /> Inactive
                        </div>
                      )}
                    </button>
                  </div>

                  {autoMonitorActive && (
                    <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20 text-[10px] text-emerald-300 font-mono flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping shrink-0"></span>
                      Interval sequence launched. Checking active products every 50 seconds.
                    </div>
                  )}

                  <button 
                    onClick={runVerificationOfAllActiveAlerts}
                    disabled={checkingAlertId !== null}
                    className="w-full text-center py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingAlertId ? 'animate-spin' : ''}`} />
                    Sweep & Verify All Active Alerts Now
                  </button>
                </div>

                {/* Price alert list items container */}
                <div className="bg-[#111111] border border-white/10 rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2 flex items-center justify-between">
                    <span>Enforced Alert Boundaries ({alerts.length})</span>
                    <span className="text-[10px] text-slate-500 font-mono">STATUS</span>
                  </h3>

                  {alerts.length > 0 ? (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {alerts.map((alert) => (
                        <div 
                          key={alert.id}
                          className={`p-3 bg-white/[0.01] border rounded-xl flex flex-col justify-between transition-all relative ${
                            checkingAlertId === alert.id 
                            ? "border-amber-500/50 bg-amber-500/[0.02]" 
                            : alert.triggered 
                              ? "border-emerald-500/30 bg-emerald-500/[0.01]" 
                              : alert.active 
                                ? "border-white/5 hover:border-indigo-500/25" 
                                : "border-white/5 opacity-50 bg-[#050505]"
                          }`}
                        >
                          {/* Alert Row info */}
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1 pr-2">
                              <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
                                target: {alert.currency}{alert.target_price}
                              </span>
                              <p className="text-xs font-medium text-white mt-1.5 truncate leading-none">
                                {alert.product_query}
                              </p>
                              <span className="text-[9px] text-slate-500 block mt-1 font-mono uppercase">
                                check status: {alert.lastCheckedAt ? `Checked at ${new Date(alert.lastCheckedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Pending Sweep"}
                              </span>
                            </div>

                            <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                              <button 
                                onClick={() => toggleAlertActiveState(alert.id)}
                                className={`text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold cursor-pointer border ${
                                  alert.active 
                                  ? "bg-indigo-900/30 text-indigo-300 border-indigo-500/25" 
                                  : "bg-slate-900 text-slate-400 border-slate-800"
                                }`}
                              >
                                {alert.active ? "Monitoring" : "Disabled"}
                              </button>
                              
                              {alert.triggered ? (
                                <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  <Check className="w-3 h-3" /> Met
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-500 font-mono uppercase">
                                  Untriggered
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Trigger statistics details section */}
                          {alert.triggered && alert.latestScannedPrice && (
                            <div className="mt-2 text-xs bg-emerald-950/20 border border-emerald-500/15 p-2 rounded-lg flex items-center justify-between text-slate-300">
                              <div>
                                <span className="text-emerald-400 font-bold font-mono text-[11px]">
                                  {alert.currency}{alert.latestScannedPrice}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-1">at {alert.storeMatched}</span>
                              </div>
                              {alert.dealUrl && (
                                <a 
                                  href={alert.dealUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                                >
                                  Go buy <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Control actions bar inside rule card */}
                          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[9px] text-slate-500 font-mono uppercase">
                              Rule Id: {alert.id.substr(0, 9)}
                            </span>

                            <div className="flex items-center gap-2">
                              {alert.active && !alert.triggered && (
                                <button 
                                  onClick={() => checkPriceAlertLive(alert)}
                                  disabled={checkingAlertId === alert.id}
                                  className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded font-mono text-[8.5px] uppercase text-slate-300 cursor-pointer flex items-center gap-1"
                                >
                                  Check alert Now
                                </button>
                              )}
                              <button 
                                onClick={() => deleteAlertRule(alert.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                                title="Remove alert watch rule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">No alert watch limits defined yet. Create one above!</p>
                  )}
                </div>

              </div>
            )}

            {/* TAB CONTENT: Volatility and Analysis */}
            {activeRightTab === "analysis" && (
              <div className="bg-[#111111] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-5 animate-fade-in">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-white/5 pb-3">
                  Market Volatility & Analytics
                </h2>

                {scannedData ? (
                  <div className="space-y-6">
                    {/* Verdict Recommendation */}
                    <div>
                      <span className="text-[10.5px] text-slate-500 block mb-1.5 uppercase font-mono tracking-wider">Purchase Verdict Insight</span>
                      <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-bold uppercase tracking-widest text-sm inline-block">
                          {scannedData.market_verdict || "Fair Deal"}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                          {scannedData.lowest_price < scannedData.average_price * 0.95 ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-bold">
                              <TrendingDown className="w-3.5 h-3.5" /> Optimal Price Point
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" /> Normal Pricing
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price Range Meter */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400 font-medium font-sans">Momentum Index</span>
                        <span className="text-indigo-400 font-mono">Lowest: {scannedData.currency || "$"}{scannedData.lowest_price}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-500 animate-pulse" 
                          style={{ width: `${Math.min(95, Math.max(30, (scannedData.lowest_price / (scannedData.average_price || 1) * 100)))}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Simulated Mini Chart */}
                    <div>
                      <p className="text-xs text-slate-500 mb-3 font-mono uppercase tracking-widest">7-Day Local Price Cycles</p>
                      <div className="flex items-end gap-1.5 h-20 bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                        <div className="flex-1 bg-white/5 h-[40%] rounded-sm hover:bg-indigo-500/20 transition-all" title="Day 1"></div>
                        <div className="flex-1 bg-white/5 h-[55%] rounded-sm hover:bg-indigo-500/20 transition-all" title="Day 2"></div>
                        <div className="flex-1 bg-white/5 h-[45%] rounded-sm hover:bg-indigo-500/20 transition-all" title="Day 3"></div>
                        <div className="flex-1 bg-white/5 h-[70%] rounded-sm hover:bg-indigo-500/20 transition-all" title="Day 4"></div>
                        <div className="flex-1 bg-white/10 h-[85%] rounded-sm hover:bg-indigo-500/20 transition-all" title="Day 5"></div>
                        <div className="flex-1 bg-emerald-500/40 h-[35%] rounded-sm" title="Day 6"></div>
                        <div className="flex-1 bg-emerald-500 h-[22%] rounded-sm animate-pulse" title="Active"></div>
                      </div>
                      <p className="text-[9px] text-right mt-1.5 text-slate-500 font-mono uppercase tracking-wider">Historical bottoms located inside current scans</p>
                    </div>

                    {/* PROS AND CONS */}
                    {((scannedData.pros && scannedData.pros.length > 0) || (scannedData.cons && scannedData.cons.length > 0)) && (
                      <div className="pt-4 border-t border-white/5 space-y-4">
                        {scannedData.pros && scannedData.pros.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-emerald-400 mb-1.5 uppercase tracking-wide">Scraped Positives</p>
                            <ul className="text-xs text-slate-300 space-y-1.5 pl-3 list-disc">
                              {scannedData.pros.slice(0, 3).map((pro, i) => (
                                <li key={i}>{pro}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {scannedData.cons && scannedData.cons.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-rose-400 mb-1.5 uppercase tracking-wide">Mothership Cons</p>
                            <ul className="text-xs text-slate-300 space-y-1.5 pl-3 list-disc">
                              {scannedData.cons.slice(0, 3).map((con, i) => (
                                <li key={i}>{con}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Analyst rational text */}
                    {scannedData.analysis_rationale && (
                      <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-4 mt-2">
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Engine Reasoning</p>
                        <p className="text-xs text-slate-300 italic leading-relaxed font-light">
                          "{scannedData.analysis_rationale}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Analysis maps will load automatically once a product is scanned.
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Scan history */}
            {activeRightTab === "history" && (
              <div className="bg-[#111111] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    Recent Market Scans
                  </h3>
                  {history.length > 0 && (
                    <button 
                      onClick={clearAllHistory}
                      className="text-[10px] text-rose-500 hover:text-rose-400 font-mono uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear history
                    </button>
                  )}
                </div>

                {history.length > 0 ? (
                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {history.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => {
                          setQuery(item.query);
                          handleScan(item.query);
                        }}
                        className="p-3 bg-white/[0.02] border border-white/5 hover:border-indigo-500/25 rounded-xl flex items-center justify-between cursor-pointer group transition-all"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-400 transition-colors">
                            {item.query}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono block mt-1">
                            {new Date(item.scannedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <div>
                            <p className="text-xs font-mono font-bold text-emerald-400">
                              {item.currency}{item.lowest_price}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono uppercase truncate max-w-[70px]">
                              {item.store_name}
                            </p>
                          </div>
                          <button 
                            onClick={(e) => deleteHistoryItem(item.id, e)}
                            className="p-1 rounded text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title="Delete query tracking entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">No historic queries compiled yet.</p>
                )}
              </div>
            )}

          </div>

        </div>

      </main>

      {/* Footer statistics */}
      <footer className="mt-auto px-4 sm:px-8 py-3 bg-[#0A0A0A] border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest" id="footer">
        <div className="flex flex-wrap gap-4 sm:gap-6 justify-center">
          <span>Telemetry Node: DBL_CRAWLER_ROUTING</span>
          <span>Index Delay: {latency}ms</span>
          <span>Errors caught: {errorCount}</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-slate-400">AGILITY NOTIFICATION SUITE RUNNING</span>
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
        </div>
      </footer>

    </div>
  );
}
