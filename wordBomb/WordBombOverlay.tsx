/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ComponentDispatch, createRoot, FluxDispatcher, React, ReactDOM, SelectedChannelStore, useEffect, UserStore, useRef, useState } from "@webpack/common";

import { settings } from "./settings";

// ─── Dictionary ───────────────────────────────────────────────────────────────
const DICT_URLS = [
    "https://raw.githubusercontent.com/words/an-array-of-french-words/master/index.json",
    "https://raw.githubusercontent.com/nightcordoff/dicofr/refs/heads/main/dico.txt",
];
const FALLBACK_WORDS = [
    "maison", "chat", "chien", "soleil", "pomme", "banane", "ordinateur",
    "clavier", "souris", "ecran", "table", "chaise", "fenetre", "porte",
    "voiture", "avion", "bateau", "train", "velo", "moto",
];

// Module-level cache: dictionary is fetched once per Discord session, not per overlay mount.
let dictCache: string[] | null = null;

// ─── Persistent settings (localStorage) ──────────────────────────────────────
const mem: Record<string, string> = {};
function getSetting(key: string, def: string): string {
    try { const v = localStorage.getItem(key); if (v !== null) return v; } catch {}
    return mem[key] !== undefined ? mem[key] : def;
}
function setSetting(key: string, val: string) {
    mem[key] = val;
    try { localStorage.setItem(key, val); } catch {}
}

// ─── Mount / unmount ──────────────────────────────────────────────────────────
let overlayRoot: ReturnType<typeof createRoot> | null = null;
let overlayContainer: HTMLDivElement | null = null;

export function isOverlayOpen() { return overlayContainer !== null; }

export function toggleWordBombOverlay() {
    overlayContainer ? unmountOverlay() : mountOverlay();
}

function mountOverlay() {
    if (overlayContainer) return;
    overlayContainer = document.createElement("div");
    overlayContainer.id = "nc-wb-root";
    document.body.appendChild(overlayContainer);
    overlayRoot = createRoot(overlayContainer);
    overlayRoot.render(<WordBombOverlay />);
}

function unmountOverlay() {
    try { overlayRoot?.unmount(); } catch {}
    overlayContainer?.remove();
    overlayRoot = null;
    overlayContainer = null;
}

// ─── Overlay component ────────────────────────────────────────────────────────
export function WordBombOverlay() {
    const [alphabet, setAlphabet] = useState<string[]>("abcdefghijklmnopqrstuvwxyz".split(""));
    const [dictionary, setDictionary] = useState<string[]>(dictCache ?? FALLBACK_WORDS);
    const [syllable, setSyllable] = useState("");
    const [status, setStatus] = useState(dictCache ? `Ready! (${dictCache.length} words)` : "Loading dict...");
    const [history, setHistory] = useState<{ alphabet: string[]; word: string; }[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const isTypingRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [badWords, setBadWords] = useState<Set<string>>(new Set());
    const [definition, setDefinition] = useState("");
    const [pos, setPos] = useState({ x: 100, y: 100 });
    const dragOffset = useRef({ x: 0, y: 0 });
    const inputRef = useRef<HTMLInputElement>(null);

    const [lps, setLps] = useState(() => parseFloat(getSetting("wb_lps", "50")));
    const [humanChance, setHumanChance] = useState(() => parseInt(getSetting("wb_humanChance", "0")));
    const [safeMode, setSafeMode] = useState(() => getSetting("wb_safeMode", "true") === "true");
    const [theme, setTheme] = useState(() => getSetting("wb_theme", ""));
    const [themeWords, setThemeWords] = useState<Set<string>>(new Set());
    const [playMode, setPlayMode] = useState(() => getSetting("wb_playMode", "Normal"));
    const [noSpace, setNoSpace] = useState(() => getSetting("wb_noSpace", "false") === "true");
    const [autoMode, setAutoMode] = useState(() => getSetting("wb_autoMode", "false") === "true");
    const lastAutoKey = useRef("");

    // ── Load dictionary (uses cache if available) ──────────────────────────────
    useEffect(() => {
        if (dictCache) return; // already loaded this session
        setStatus("Loading dictionaries...");
        Promise.all(
            DICT_URLS.map(url =>
                fetch(url)
                    .then(async res => {
                        if (!res.ok) return [];
                        if (url.endsWith(".json")) return res.json() as Promise<string[]>;
                        const text = await res.text();
                        return text.split(/[\r\n]+/).map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
                    })
                    .catch(() => [] as string[])
            )
        ).then(results => {
            const merged = Array.from(new Set((results.flat() as string[]).filter(w => {
                if (w.length < 3 || w.length > 15) return false;
                if (w[0] === w[0].toUpperCase()) return false;
                if (w === w.toUpperCase() && w.length > 1) return false;
                return /^[a-zœæéèêëàâäîïôöùûüç]+$/i.test(w);
            }).map(w => w.toLowerCase())));

            if (merged.length > 0) {
                dictCache = merged;
                setDictionary(merged);
                setStatus(`Ready! (${merged.length} words)`);
            } else {
                dictCache = FALLBACK_WORDS;
                setDictionary(FALLBACK_WORDS);
                setStatus("Dict. unavailable (fallback)");
            }
        }).catch(() => setStatus("Dict. error (fallback active)"));
    }, []);

    // ── Theme: fetch Wikipedia words ──────────────────────────────────────────
    useEffect(() => {
        if (!theme.trim()) { setThemeWords(new Set()); return; }
        fetch(`https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(theme)}&utf8=&format=json&srlimit=1`)
            .then(r => r.json())
            .then(d => {
                const pageId = d.query?.search?.[0]?.pageid;
                if (!pageId) throw new Error("No page");
                return fetch(`https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${pageId}&format=json`);
            })
            .then(r => r.json())
            .then(d => {
                const pages = d.query?.pages;
                if (!pages) return;
                const extract = (Object.values(pages)[0] as any)?.extract ?? "";
                const words = extract.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœ]+/g) ?? [];
                setThemeWords(new Set(words.filter((w: string) => w.length > 3)));
            })
            .catch(() => setThemeWords(new Set()));
    }, [theme]);

    // ── Drag ──────────────────────────────────────────────────────────────────
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    };

    useEffect(() => {
        if (!isDragging) return;
        let rafId: number;
        const onMove = (e: MouseEvent) => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() =>
                setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
            );
        };
        const onUp = () => { setIsDragging(false); cancelAnimationFrame(rafId); };
        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            cancelAnimationFrame(rafId);
        };
    }, [isDragging]);

    // ── Word search ───────────────────────────────────────────────────────────
    const processSearch = (syl: string, isReroll = false) => {
        if (isTypingRef.current) return;
        const query = (syl || syllable).toLowerCase().trim();
        if (!query || dictionary.length === 0) return;

        let matches = dictionary.filter(w => {
            if (!w.includes(query)) return false;
            if (badWords.has(w)) return false;
            if (noSpace && (w.includes(" ") || w.includes("-"))) return false;
            if (playMode === "Pro" && w.length < 13) return false;
            if (playMode === "Noob" && w.length > 7) return false;
            return true;
        });

        if (themeWords.size > 0) {
            const themed = matches.filter(w => themeWords.has(w));
            if (themed.length > 0) matches = themed;
        }

        if (matches.length === 0) { setStatus("No words found"); return; }

        let bestWord = "";
        let bestScore = -Infinity;
        for (let i = 0; i < matches.length; i++) {
            const w = matches[i];
            let score = 0;
            const seen = new Set<string>();
            for (const ch of w) {
                if (alphabet.includes(ch) && !seen.has(ch)) { score += 100; seen.add(ch); }
            }
            score += Math.max(0, 100 - i / 1000);
            if (playMode === "Pro") score += w.length * 5;
            else if (playMode === "Noob") score -= w.length * 10;
            if (themeWords.has(w)) score += 1000;
            if (score > bestScore) { bestScore = score; bestWord = w; }
        }

        if (!isReroll) setHistory(prev => [...prev, { alphabet: [...alphabet], word: bestWord }]);
        const remaining = alphabet.filter(l => !bestWord.includes(l));
        setAlphabet(remaining.length === 0 ? "abcdefghijklmnopqrstuvwxyz".split("") : remaining);
        sendWord(bestWord);
        if (!isReroll) setSyllable("");
    };

    // ── AUTO mode: detect syllable from bot messages ──────────────────────────
    const processSearchRef = useRef(processSearch);
    processSearchRef.current = processSearch;

    useEffect(() => {
        if (!autoMode) return;

        const handler = (event: any) => {
            try {
                const msg = event.message;
                if (!msg || isTypingRef.current) return;
                if (msg.channel_id !== SelectedChannelStore.getChannelId()) return;
                if (!msg.author?.bot) return;

                // Collect all visible text (content + embeds)
                let text = msg.content ?? "";
                for (const e of msg.embeds ?? []) {
                    text += "\n" + (e.title ?? e.rawTitle ?? "") + "\n" + (e.description ?? e.rawDescription ?? "");
                    for (const f of e.fields ?? []) text += "\n" + (f.name ?? "") + "\n" + (f.value ?? "");
                }

                // Only play when it's OUR turn (bot mentions us)
                const me = UserStore.getCurrentUser()?.id;
                const mentionsMe =
                    text.includes(`<@${me}>`) || text.includes(`<@!${me}>`) ||
                    (msg.mentions ?? []).some((m: any) => (m?.id ?? m) === me);
                if (!mentionsMe) return;

                // Syllable = short letter group in **bold** or `backticks`
                const m =
                    text.match(/\*\*\s*([a-zàâçéèêëîïôûùüÿñæœ]{2,6})\s*\*\*/i) ??
                    text.match(/`\s*([a-zàâçéèêëîïôûùüÿñæœ]{2,6})\s*`/i);
                if (!m) return;

                const syl = m[1].toLowerCase();
                const key = `${msg.id}:${syl}`;
                if (key === lastAutoKey.current) return;
                lastAutoKey.current = key;

                setSyllable(syl);
                setStatus(`AUTO: ${syl}`);
                // Small human-like reaction delay before answering
                setTimeout(() => {
                    if (!isTypingRef.current) processSearchRef.current(syl);
                }, 350 + Math.random() * 450);
            } catch (e) {
                console.error("[WordBomb] AUTO error:", e);
            }
        };

        FluxDispatcher.subscribe("MESSAGE_CREATE", handler);
        FluxDispatcher.subscribe("MESSAGE_UPDATE", handler);
        return () => {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", handler);
            FluxDispatcher.unsubscribe("MESSAGE_UPDATE", handler);
        };
    }, [autoMode]);

    const handleReroll = () => {
        if (history.length === 0) return;
        const last = history[history.length - 1];
        setBadWords(prev => new Set(prev).add(last.word));
        setAlphabet(last.alphabet);
        setHistory(prev => prev.slice(0, -1));
        processSearch(syllable, true);
    };

    // ── Typing simulation ─────────────────────────────────────────────────────
    const sendWord = async (word: string) => {
        isTypingRef.current = true;
        setIsTyping(true);
        setStatus(`Typing: ${word}…`);

        if (safeMode) {
            setDefinition("Generating AI definition…");
            const groqKey = settings.store.groqKey;
            if (!groqKey) {
                setDefinition("Add your Groq API key in Equicord settings (Plugins > WordBomb).");
            } else {
                fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        temperature: 0.7,
                        max_tokens: 120,
                        messages: [{ role: "user", content: `Donne une très courte définition (1 phrase) pour le mot suivant en français, sans donner sa nature grammaticale. Mot: "${word}"` }],
                    }),
                })
                    .then(r => r.json())
                    .then(d => setDefinition(d.choices?.[0]?.message?.content?.trim() ?? "AI could not define this word."))
                    .catch(() => setDefinition("Network error (Groq API)."));
            }
        } else {
            setDefinition("");
        }

        try {
            const wbNative = (window as any).VencordNative?.wordBomb;
            if (wbNative?.sequence) {
                await wbNative.sequence(word, lps, humanChance, -1, -1);
            } else {
                // Find and focus Discord's Slate message editor
                const editor = document.querySelector("[data-slate-editor='true']") as HTMLElement | null;
                if (!editor) { setStatus("Chat input not found"); return; }

                editor.focus();
                await new Promise<void>(r => setTimeout(r, 40));

                const delay = Math.round(1000 / lps);

                for (const char of word) {
                    // Simulate a typo then backspace
                    if (humanChance > 0 && Math.random() * 100 < humanChance) {
                        const typo = String.fromCharCode(97 + Math.floor(Math.random() * 26));
                        ComponentDispatch?.dispatchToLastSubscribed("INSERT_TEXT", { rawText: typo, plainText: typo });
                        await new Promise<void>(r => setTimeout(r, delay * 2));
                        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", keyCode: 8, bubbles: true, cancelable: true }));
                        await new Promise<void>(r => setTimeout(r, delay));
                    }

                    ComponentDispatch?.dispatchToLastSubscribed("INSERT_TEXT", { rawText: char, plainText: char });
                    await new Promise<void>(r => setTimeout(r, delay));
                }

                await new Promise<void>(r => setTimeout(r, 80));

                // Submit via real Enter keydown on the Slate editor
                editor.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter", code: "Enter", keyCode: 13, which: 13,
                    bubbles: true, cancelable: true,
                }));
            }
            setStatus("Prêt !");
        } catch (e) {
            console.error("[WordBomb] Typing error:", e);
            setStatus("Typing error");
        } finally {
            isTypingRef.current = false;
            setIsTyping(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return ReactDOM.createPortal(
        <div
            className={`nc-wb-overlay${isDragging ? " dragging" : ""}`}
            style={{ top: pos.y, left: pos.x }}
            onClick={e => e.stopPropagation()}
        >
            <div className="nc-wb-header" onMouseDown={handleMouseDown}>
                <h3>🎯 WordBomb Helper</h3>
                <div className="nc-wb-close" onClick={unmountOverlay}>✕</div>
            </div>

            <div className="nc-wb-content">
                {!isSettingsOpen ? (
                    <>
                        <div className="nc-wb-alphabet">
                            {alphabet.map(l => (
                                <span key={l} className="nc-wb-letter">{l.toUpperCase()}</span>
                            ))}
                        </div>

                        <input
                            ref={inputRef}
                            type="text"
                            className="nc-wb-input"
                            placeholder="Syllable…"
                            value={syllable}
                            onChange={e => setSyllable(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && processSearch(syllable)}
                        />

                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                onClick={() => processSearch(syllable)}
                                disabled={isTyping}
                                style={{ flex: 1, padding: "10px", background: "#7c3aed", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", opacity: isTyping ? 0.5 : 1 }}
                            >
                                FIND
                            </button>
                            <button
                                onClick={handleReroll}
                                disabled={isTyping || history.length === 0}
                                title="Reroll"
                                style={{ width: "45px", height: "45px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "12px", color: "#fff", cursor: "pointer", fontSize: "18px", opacity: (isTyping || history.length === 0) ? 0.4 : 1 }}
                            >
                                🔄
                            </button>
                            <button
                                onClick={() => { const v = !autoMode; setAutoMode(v); setSetting("wb_autoMode", String(v)); }}
                                title={autoMode ? "AUTO activé : détecte la syllabe et répond tout seul" : "Activer le mode AUTO"}
                                style={{ width: "60px", height: "45px", background: autoMode ? "#16a34a" : "rgba(255,255,255,0.1)", border: "none", borderRadius: "12px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700, boxShadow: autoMode ? "0 0 10px rgba(22,163,74,0.6)" : "none" }}
                            >
                                {autoMode ? "AUTO ✓" : "AUTO"}
                            </button>
                        </div>

                        {safeMode && definition && (
                            <div style={{ fontSize: "11px", color: "#d1d5db", fontStyle: "italic", background: "#374151", padding: "8px", borderRadius: "8px", maxHeight: "80px", overflowY: "auto" }}>
                                <strong style={{ color: "#60a5fa" }}>Déf :</strong> {definition}
                            </div>
                        )}
                    </>
                ) : (
                    <div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>Speed (LPS): {lps}</label>
                            <input type="range" min="10" max="200" step="1" value={lps}
                                onChange={e => { setLps(parseFloat(e.target.value)); setSetting("wb_lps", e.target.value); }}
                                style={{ width: "100%" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>Error (%): {humanChance}%</label>
                            <input type="range" min="0" max="100" step="1" value={humanChance}
                                onChange={e => { setHumanChance(parseInt(e.target.value)); setSetting("wb_humanChance", e.target.value); }}
                                style={{ width: "100%" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#f472b6", fontWeight: "bold" }}>Thème (optionnel)</label>
                            <input type="text" placeholder="ex: sport, amour…" value={theme}
                                onChange={e => { const v = e.target.value.toLowerCase().trim(); setTheme(v); setSetting("wb_theme", v); }}
                                style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "none", background: "#374151", color: "white", marginTop: "5px", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#fbbf24", fontWeight: "bold" }}>Play Style</label>
                            <select value={playMode}
                                onChange={e => { setPlayMode(e.target.value); setSetting("wb_playMode", e.target.value); }}
                                style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "none", background: "#374151", color: "white", marginTop: "5px", outline: "none" }}>
                                <option value="Normal">Normal</option>
                                <option value="Pro">Pro (Long &amp; Complex)</option>
                                <option value="Noob">Noob (Court &amp; Simple)</option>
                            </select>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderTop: "1px solid #4b5563", paddingTop: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#ef4444", fontWeight: "bold" }}>🚫 No Spaces/Dashes</label>
                            <input type="checkbox" checked={noSpace}
                                onChange={e => { setNoSpace(e.target.checked); setSetting("wb_noSpace", String(e.target.checked)); }}
                                style={{ transform: "scale(1.2)" }} />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderTop: "1px solid #4b5563", paddingTop: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#60a5fa", fontWeight: "bold" }}>📚 Safe Mode (Déf. AI)</label>
                            <input type="checkbox" checked={safeMode}
                                onChange={e => { setSafeMode(e.target.checked); setSetting("wb_safeMode", String(e.target.checked)); }}
                                style={{ transform: "scale(1.2)" }} />
                        </div>

                        {safeMode && (
                            <div style={{ fontSize: "10px", opacity: 0.55, marginBottom: "10px", background: "#374151", padding: "6px 8px", borderRadius: "6px" }}>
                                🔑 Clé Groq → Paramètres Equicord &gt; Plugins &gt; WordBomb
                            </div>
                        )}

                        <button
                            onClick={() => setIsSettingsOpen(false)}
                            style={{ width: "100%", padding: "8px", background: "#4b5563", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>
                            ← BACK
                        </button>
                    </div>
                )}
            </div>

            <div className="nc-wb-footer">
                <div className="nc-wb-settings-btn" onClick={() => setIsSettingsOpen(v => !v)}>
                    {isSettingsOpen ? "✕" : "⚙"}
                </div>
                <div className="nc-wb-status">
                    {autoMode ? "🟢 AUTO | " : ""}{status} | LPS: {lps} | Err: {humanChance}%
                </div>
            </div>
        </div>,
        document.body
    );
}
