import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Meal } from '../types/index.js';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function buildMealContext(meal: Meal) {
  return {
    name: meal.name,
    ingredients: meal.ingredients,
    defaultServings: meal.defaultServings,
    category: meal.category,
    tags: meal.tags,
    recipeText: meal.recipeText,
    comment: meal.comment,
    prepTime: meal.prepTime,
    totalTime: meal.totalTime,
  };
}

export function RecipeChat({ meal }: { meal: Meal }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const { reply } = await api.post<{ reply: string }>('/api/recipe-chat', {
        messages: updatedMessages,
        mealContext: buildMealContext(meal),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Chat');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, meal]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="recipe-chat">
      <button
        className="recipe-chat-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        💬 KI-Kochassistent {expanded ? '▾' : '▸'}
      </button>

      {expanded && (
        <>
          <div className="recipe-chat-messages">
            {messages.length === 0 && !loading && (
              <div className="recipe-chat-welcome">
                Frag mich etwas zum Rezept — z.B. Ersatzzutaten, Varianten oder Kochtipps.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`recipe-chat-bubble recipe-chat-bubble-${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="recipe-chat-bubble recipe-chat-bubble-assistant recipe-chat-loading">
                Denke nach…
              </div>
            )}
            {error && (
              <div className="recipe-chat-error">{error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="recipe-chat-input">
            <textarea
              ref={textareaRef}
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frag mich etwas zum Rezept…"
              rows={1}
              disabled={loading}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={!input.trim() || loading}
            >
              Senden
            </button>
          </div>
        </>
      )}
    </div>
  );
}
