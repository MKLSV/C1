"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "quick" | "deep";
type Msg = { role: "user" | "bot"; content: string; crisis?: boolean };
type Income = {
  employment_mode: string;
  income_low: number;
  income_high: number;
  currency: string;
  period: string;
};
type Occupation = {
  slug: string;
  title: string;
  day_in_life: string;
  employment_modes: string[];
  income: Income[];
  first_action?: string;
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [results, setResults] = useState<Occupation[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, results]);

  async function start(m: Mode) {
    if (!consent) return;
    setBusy(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: m, consent: true }),
      });
      const data = await r.json();
      setSessionId(data.session_id);
      setMode(m);
      setMessages([{ role: "bot", content: data.reply }]);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !sessionId) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      const data = await r.json();
      if (data.error) {
        setMessages((m) => [...m, { role: "bot", content: "Упс, что-то пошло не так. Попробуй ещё раз." }]);
      } else {
        setMessages((m) => [...m, { role: "bot", content: data.reply, crisis: data.crisis }]);
        if (data.finalized) {
          setFinalized(true);
          setResults(data.recommendations ?? null);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteData() {
    if (!sessionId) return;
    await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
    setDeleted(true);
    setMessages([]);
    setResults(null);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="wrap">
      <div className="brand">
        <div className="logo">К</div>
        <div>
          <h1>Компас</h1>
          <p>Найдём конкретное дело по душе — и на чём зарабатывать</p>
        </div>
      </div>

      {!sessionId ? (
        <div className="card">
          <p className="lead">
            Я задам несколько вопросов и приведу примеры, чтобы вместе нащупать
            конкретную профессию или своё дело, которое тебе подходит. Прошлый опыт —
            плюс, но не обязателен. Выбери, как хочешь поговорить:
          </p>
          <div className="modes">
            <button className="mode-btn" disabled={busy || !consent} onClick={() => start("quick")}>
              <b>⚡ Быстрый разговор · 5–7 минут</b>
              <span>7–10 вопросов, быстрый ориентир по профессиям</span>
            </button>
            <button className="mode-btn" disabled={busy || !consent} onClick={() => start("deep")}>
              <b>🧭 Глубокий разбор · 20–30 минут</b>
              <span>Подробно про интересы, навыки и ценности — точнее результат</span>
            </button>
          </div>
          <label className="consent-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Соглашаюсь на обработку моих ответов для подбора рекомендаций. Это
              поддержка в выборе, а не гарантия заработка. Подробнее —{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">политика конфиденциальности</a>.
            </span>
          </label>
        </div>
      ) : (
        <>
          <div className="chat" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"} ${m.crisis ? "crisis" : ""}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="typing">Компас печатает…</div>}

            {finalized && results && (
              <div className="results">
                {results.map((o) => {
                  const inc = o.income[0];
                  return (
                    <div className="result" key={o.slug}>
                      <h3>{o.title}</h3>
                      <div className="meta">{o.day_in_life}</div>
                      <div>
                        {o.employment_modes.map((m) => (
                          <span className="tag" key={m}>{modeLabel(m)}</span>
                        ))}
                      </div>
                      {inc && (
                        <div className="meta" style={{ marginTop: 6 }}>
                          Доход-ориентир: {inc.income_low.toLocaleString("ru")}–
                          {inc.income_high.toLocaleString("ru")} {inc.currency}/мес
                        </div>
                      )}
                      {o.first_action && (
                        <div className="step">
                          <b>Первый шаг:</b> {o.first_action}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {deleted && (
            <div className="msg bot">Данные этой сессии удалены. Спасибо, что заглянул(а)!</div>
          )}

          {finalized && !deleted && (
            <button className="delete-btn" onClick={deleteData}>
              Удалить мои данные
            </button>
          )}

          {!finalized && (
            <div className="composer">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Напиши ответ…"
                disabled={busy}
              />
              <button onClick={send} disabled={busy || !input.trim()}>
                ➤
              </button>
            </div>
          )}
        </>
      )}

      <div className="footnote">Компас · профориентация через разговор · MVP</div>
    </div>
  );
}

function modeLabel(m: string): string {
  switch (m) {
    case "employee": return "наём";
    case "freelance": return "фриланс";
    case "business": return "своё дело";
    case "hybrid": return "гибрид";
    default: return m;
  }
}
