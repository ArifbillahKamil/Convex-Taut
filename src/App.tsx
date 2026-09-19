import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  useAction,
  useConvexAuth,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Globe,
  Layers,
  Link,
  LoaderCircle,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sprout,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

type Source = Doc<"sources">;
type Session = Doc<"sessions">;
type View = "library" | "ask" | "learn" | "favorites";
type Citation = { sourceId: Id<"sources">; title: string; quote: string };
const requestId = () => crypto.randomUUID();
const errorText = (error: unknown) =>
  error instanceof ConvexError
    ? String(error.data)
    : "Something interrupted that request. Please try again.";
const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    time,
  );
const Icon = ({ kind }: { kind: Source["kind"] }) =>
  kind === "article" ? (
    <Globe size={18} />
  ) : kind === "email" ? (
    <Mail size={18} />
  ) : (
    <FileText size={18} />
  );

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <img src="/favicon.svg" alt="" />
      <span>
        taut<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
function Busy({ text = "Working on it…" }: { text?: string }) {
  return (
    <span className="busy">
      <LoaderCircle size={16} className="spin" />
      {text}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">{title}</span>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  if (isLoading)
    return (
      <div className="opening">
        <Mark />
        <Busy text="Opening your space…" />
      </div>
    );
  if (isAuthenticated) return <Workspace />;
  return (
    <div className="welcome">
      <header>
        <Mark />
        <span className="eyebrow">A little more curious, every day.</span>
      </header>
      <main>
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> A home for what stays with you
          </span>
          <h1>
            Keep the idea.
            <br />
            <em>Find the connection.</em>
          </h1>
          <p>
            The article you saved. The question it sparked. The thing you
            finally understood. Bring them together in one personal learning
            space.
          </p>
          <button
            className="primary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await signIn("anonymous");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? (
              <Busy text="Opening…" />
            ) : (
              <>
                Open my space <ArrowRight size={18} />
              </>
            )}
          </button>
          <small>
            No signup form. Your space stays in this browser.
            <br />
            Clearing browser data loses access. Cross-device accounts are coming
            later.
          </small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="paper paper-one">
            <span>01 / KEEP</span>
            <BookOpen />
            <h3>
              An idea worth
              <br />
              coming back to.
            </h3>
            <div className="paper-lines" />
          </div>
          <div className="paper paper-two">
            <span>02 / CONNECT</span>
            <p>
              “How does this relate to
              <br />
              what I already know?”
            </p>
            <span className="ink-circle">
              <ArrowUpRight />
            </span>
          </div>
          <div className="art-note">
            From saved for later
            <br />
            <em>to understood for good.</em>
          </div>
        </div>
      </main>
      <footer>
        <span>A collection that becomes a conversation.</span>
        <span>Keep. Connect. Understand.</span>
      </footer>
    </div>
  );
}

function Workspace() {
  const connection = useConvexConnectionState();
  const sources = useQuery(api.library.list, {}),
    sessions = useQuery(api.learning.sessions, {}),
    settings = useQuery(api.library.settings, {});
  const seed = useMutation(api.library.seed),
    update = useMutation(api.library.update),
    remove = useMutation(api.library.remove);
  const [view, setView] = useState<View>("library"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All sources");
  const [modal, setModal] = useState<"add" | "settings" | "learn" | null>(null),
    [openedId, setOpenedId] = useState<Id<"sources"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null),
    [picked, setPicked] = useState<Id<"sources">[]>([]),
    [notice, setNotice] = useState("");
  const [seeding, setSeeding] = useState(false);
  const opened = sources?.find((s) => s._id === openedId),
    currentSession = sessions?.find((s) => s._id === sessionId);
  const ready = sources?.filter((s) => s.status === "ready") ?? [];
  const visible = sources?.filter(
    (s) =>
      (view !== "favorites" || s.favorite) &&
      (filter === "All sources" ||
        (filter === "Articles"
          ? s.kind === "article"
          : filter === "Notes"
            ? s.kind === "note"
            : s.kind === "email")) &&
      `${s.title} ${s.content} ${s.topic}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const resume = sessions?.find((s) => s.state !== "completed");
  const navigate = (next: View) => {
    setView(next);
    setSessionId(null);
    setSearch("");
    setFilter("All sources");
  };
  const startLearn = (ids?: Id<"sources">[]) => {
    setPicked(ids ?? ready.slice(0, 3).map((s) => s._id));
    setModal("learn");
  };
  const notify = (message: string) => {
    setNotice(message);
  };
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand-link"
          onClick={(e) => {
            e.preventDefault();
            navigate("library");
          }}
          aria-label="Taut home"
        >
          <Mark />
        </a>
        <div className="space-label">
          <span className="space-avatar">Y</span>
          <div>
            Your personal space<small>A place for curious minds</small>
          </div>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <nav>
          {(
            [
              {
                id: "library",
                label: "My library",
                icon: <Layers size={19} />,
                count: sources?.length,
              },
              {
                id: "ask",
                label: "Ask my library",
                icon: <MessageCircle size={19} />,
              },
              {
                id: "learn",
                label: "Keep learning",
                icon: <Sprout size={20} />,
                count: sessions?.filter((s) => s.state !== "completed").length,
              },
              { id: "favorites", label: "Favorites", icon: <Star size={18} /> },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {"count" in item && !!item.count && <b>{item.count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="inbox-card">
            <span className="inbox-icon">
              <Mail size={21} />
            </span>
            <h3>Good reads find a home.</h3>
            <p>Forward a newsletter. Keep the ideas worth returning to.</p>
            <button onClick={() => setModal("settings")}>
              {settings?.inboxId ? "View my inbox" : "Set up email capture"}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="settings-btn" onClick={() => setModal("settings")}>
            <Settings2 size={17} /> Space & connections
          </button>
          <span className="made-for">
            Made for everyday curiosity <span>↗</span>
          </span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            My space <ChevronRight size={13} />
            <span>
              {view === "library"
                ? "Library"
                : view === "ask"
                  ? "Ask"
                  : view === "learn"
                    ? "Learning"
                    : "Favorites"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="sync">
              <span />
              {!connection.isWebSocketConnected
                ? "Reconnecting…"
                : connection.inflightMutations
                  ? "Saving…"
                  : "Saved with Convex"}
            </span>
            <button
              className="avatar"
              onClick={() => setModal("settings")}
              aria-label="Space settings"
            >
              Y
            </button>
          </div>
        </header>
        <div className="page">
          {(view === "library" || view === "favorites") && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">YOUR GROWING COLLECTION</span>
                  <h1>
                    {view === "favorites" ? (
                      "The ones worth keeping close."
                    ) : (
                      <>
                        A home for your <em>curiosity.</em>
                      </>
                    )}
                  </h1>
                  <p>
                    Save what catches your mind. Come back with a better
                    question.
                  </p>
                </div>
                <button className="primary" onClick={() => setModal("add")}>
                  <Plus size={18} /> Save something
                </button>
              </section>
              {view === "library" && (
                <section className="learning-banner">
                  <div className="banner-art" aria-hidden="true">
                    <div className="book-leaf one" />
                    <div className="book-leaf two" />
                    <div className="book-leaf three" />
                    <span>✳</span>
                  </div>
                  <div className="banner-copy">
                    <span className="eyebrow">
                      {resume
                        ? "PICK UP YOUR THREAD"
                        : "FROM COLLECTING TO CONNECTING"}
                    </span>
                    <h2>
                      {resume?.goal || "Make a little room for understanding."}
                    </h2>
                    <p>
                      {resume?.lastQuestion ||
                        "A few saved ideas. One good question. A small moment of discovery."}
                    </p>
                  </div>
                  <button
                    className="light-button"
                    onClick={() => {
                      if (resume) {
                        setView("learn");
                        setSessionId(resume._id);
                      } else startLearn();
                    }}
                  >
                    {resume ? "Continue learning" : "Start a learning session"}
                    <ArrowRight size={17} />
                  </button>
                </section>
              )}
              <section className="collection">
                <div className="collection-top">
                  <h2>
                    {view === "favorites"
                      ? "Your favorites"
                      : "All the things you kept"}{" "}
                    <span>{visible?.length ?? "—"}</span>
                  </h2>
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search saved sources"
                      placeholder="Find something in your library…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-btn"
                        aria-label="Clear search"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>
                <div className="filter-row">
                  <div className="tabs">
                    {["All sources", "Articles", "Notes", "Email"].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <span className="sort-label">
                    Newest first <ArrowDown size={13} />
                  </span>
                </div>
                {!sources ? (
                  <div className="empty">
                    <Busy text="Gathering your saved ideas…" />
                  </div>
                ) : !visible?.length ? (
                  <div className="empty">
                    <span className="empty-icon">
                      <Bookmark size={28} />
                    </span>
                    <h2>
                      {sources.length
                        ? "Nothing here just yet."
                        : "Every collection starts with a spark."}
                    </h2>
                    <p>
                      {sources.length
                        ? "Try another filter or search, or save a new source."
                        : "Save an article, write a thought, or explore five original example notes."}
                    </p>
                    <div className="button-row">
                      <button
                        className="primary"
                        onClick={() => setModal("add")}
                      >
                        <Plus size={17} /> Save your first idea
                      </button>
                      {!settings?.seeded && (
                        <button
                          className="secondary"
                          disabled={seeding}
                          onClick={async () => {
                            setSeeding(true);
                            try {
                              await seed();
                            } catch (e) {
                              notify(errorText(e));
                            } finally {
                              setSeeding(false);
                            }
                          }}
                        >
                          {seeding ? "Adding…" : "Explore sample library"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="source-list">
                    <div className="list-labels">
                      <span>SOURCE / IDEA</span>
                      <span>COLLECTION</span>
                      <span>SAVED</span>
                      <span />
                    </div>
                    {visible.map((s) => (
                      <article className="source-row" key={s._id}>
                        <button
                          className="source-open"
                          onClick={() => {
                            setOpenedId(s._id);
                            void update({ id: s._id, read: true }).catch((e) =>
                              notify(errorText(e)),
                            );
                          }}
                        >
                          <span className={`source-icon ${s.kind}`}>
                            <Icon kind={s.kind} />
                          </span>
                          <span className="source-text">
                            <span className="source-title">
                              {s.title}
                              {!s.read && <i title="Unread" />}
                            </span>
                            <span className="source-meta">
                              {s.domain}
                              <span>·</span>
                              {s.status === "processing"
                                ? "Importing…"
                                : s.status === "error"
                                  ? "Import needs attention"
                                  : `${Math.max(1, Math.ceil(s.content.split(/\s+/).length / 220))} min read`}
                              {s.sample && (
                                <span className="sample-tag">Example</span>
                              )}
                            </span>
                          </span>
                        </button>
                        <span className="topic-tag">{s.topic}</span>
                        <time>{date(s.capturedAt)}</time>
                        <button
                          className={`icon-btn favorite ${s.favorite ? "is-favorite" : ""}`}
                          aria-label={
                            s.favorite
                              ? `Unfavorite ${s.title}`
                              : `Favorite ${s.title}`
                          }
                          onClick={() =>
                            void update({
                              id: s._id,
                              favorite: !s.favorite,
                            }).catch((e) => notify(errorText(e)))
                          }
                        >
                          <Star
                            size={17}
                            fill={s.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                <div className="collection-foot">
                  <span>
                    <span className="tiny-dot" /> Your sources. Your
                    connections. Your pace.
                  </span>
                  <span>{sources?.length ?? 0} / 200 sources</span>
                </div>
              </section>
              <section className="quiet-note">
                <span>“</span>
                <p>
                  You don't need to know everything.
                  <br />
                  <em>Just keep following what makes you curious.</em>
                </p>
                <span className="note-flower">✳</span>
              </section>
            </>
          )}
          {view === "ask" && (
            <Ask sources={ready} openSource={setOpenedId} notify={notify} />
          )}
          {view === "learn" &&
            (currentSession ? (
              <LearningSession
                session={currentSession}
                openSource={setOpenedId}
                notify={notify}
                onBack={() => setSessionId(null)}
              />
            ) : (
              <>
                <section className="page-heading">
                  <div>
                    <span className="eyebrow">ONE IDEA AT A TIME</span>
                    <h1>
                      Keep the thread <em>going.</em>
                    </h1>
                    <p>
                      No streak to protect. Just a question worth coming back
                      to.
                    </p>
                  </div>
                  <button className="primary" onClick={() => startLearn()}>
                    <Plus size={18} /> New session
                  </button>
                </section>
                <div className="session-grid">
                  {sessions?.map((s) => (
                    <button
                      className="session-card"
                      key={s._id}
                      onClick={() => setSessionId(s._id)}
                    >
                      <span className="session-status">
                        <Sprout size={19} />
                        {s.state === "completed"
                          ? "Finished for now"
                          : s.state === "paused"
                            ? "Ready when you are"
                            : "In progress"}
                      </span>
                      <h2>{s.goal}</h2>
                      <p>
                        {s.lastQuestion ||
                          s.preview ||
                          (s.busy
                            ? "Preparing your first question…"
                            : "Open your learning session.")}
                      </p>
                      <div>
                        <span>
                          {s.sourceIds.length} sources · {s.turnCount} exchanges
                        </span>
                        <ArrowUpRight size={22} />
                      </div>
                    </button>
                  ))}
                </div>
                {sessions?.length === 0 && (
                  <div className="empty">
                    <Sprout size={35} />
                    <h2>A small question can go a long way.</h2>
                    <p>
                      Choose a few saved sources and something you want to
                      understand.
                      <br />
                      Your next step will be here when you return.
                    </p>
                    <button className="secondary" onClick={() => startLearn()}>
                      Start your first session <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </>
            ))}
          <footer className="page-footer">
            <Mark small />
            <span>A little more understood.</span>
            <span>EARLY EDITION · 2026</span>
          </footer>
        </div>
      </main>
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "add" && (
        <SaveModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            notify("Saved. A new thread to follow.");
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          settings={settings}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === "learn" && (
        <BeginModal
          sources={ready}
          initialIds={picked}
          onClose={() => setModal(null)}
          onStarted={(id) => {
            setModal(null);
            setView("learn");
            setSessionId(id);
          }}
        />
      )}
      {opened && (
        <Modal
          title={opened.sample ? "ORIGINAL EXAMPLE NOTE" : "YOUR SAVED SOURCE"}
          onClose={() => setOpenedId(null)}
          wide
        >
          <div className="reader">
            <span className="topic-tag">{opened.topic}</span>
            <h1>{opened.title}</h1>
            <div className="reader-meta">
              <Icon kind={opened.kind} />
              {opened.domain}
              <span>·</span>
              {date(opened.capturedAt)}
              {opened.url && (
                <a href={opened.url} target="_blank" rel="noreferrer">
                  Open original <ArrowUpRight size={14} />
                </a>
              )}
            </div>
            {opened.intention && (
              <aside className="intention">
                <span>WHY THIS STAYED WITH YOU</span>
                <p>{opened.intention}</p>
              </aside>
            )}
            {opened.status === "processing" ? (
              <Busy text="Reading the page with Firecrawl…" />
            ) : opened.error ? (
              <p className="error" role="alert">
                {opened.error}
              </p>
            ) : (
              <div className="prose">{opened.content}</div>
            )}
            {opened.truncated && (
              <p className="muted">
                Showing the first 50,000 characters of this source.
              </p>
            )}
            <div className="reader-actions">
              <button
                className="primary"
                disabled={opened.status !== "ready"}
                onClick={() => {
                  startLearn([opened._id]);
                  setOpenedId(null);
                }}
              >
                Learn from this <ArrowRight size={16} />
              </button>
              <button
                className="icon-btn danger"
                aria-label="Remove source"
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this source? Existing learning history will remain.",
                    )
                  )
                    void remove({ id: opened._id })
                      .then(() => {
                        setOpenedId(null);
                        notify("Source removed.");
                      })
                      .catch((e) => notify(errorText(e)));
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SaveModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useMutation(api.library.save);
  const [kind, setKind] = useState<"link" | "note">("link"),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [content, setContent] = useState(""),
    [topic, setTopic] = useState(""),
    [intention, setIntention] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useRef(requestId());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        title,
        content,
        url: kind === "link" ? url : undefined,
        topic,
        intention,
        requestId: id.current,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="ADD TO YOUR COLLECTION" onClose={onClose}>
      <h1>
        Something worth <em>keeping.</em>
      </h1>
      <p className="muted">Give a good idea a place to land.</p>
      <div className="segmented">
        <button
          className={kind === "link" ? "selected" : ""}
          onClick={() => setKind("link")}
        >
          <Link size={17} /> Article or link
        </button>
        <button
          className={kind === "note" ? "selected" : ""}
          onClick={() => setKind("note")}
        >
          <FileText size={17} /> A personal note
        </button>
      </div>
      <form onSubmit={submit}>
        {kind === "link" && (
          <label>
            Page URL
            <input
              required
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <small>
              Firecrawl imports the readable text. Some websites may block
              imports.
            </small>
          </label>
        )}
        <label>
          Title {kind === "link" && <span className="muted">(optional)</span>}
          <input
            required={kind === "note"}
            maxLength={180}
            placeholder="What caught your attention?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {kind === "note" && (
          <label>
            Your note
            <textarea
              required
              rows={6}
              maxLength={50000}
              placeholder="An idea, a passage, a thought in progress…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        )}
        <label>
          Collection <span className="muted">(optional)</span>
          <input
            maxLength={50}
            placeholder="e.g. Learning, Design, Everyday thinking"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label>
          Why save this? <span className="muted">(optional)</span>
          <input
            maxLength={400}
            placeholder="Leave a little context for your future self."
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? (
            <Busy text="Saving…" />
          ) : (
            <>
              Save to my library <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
function SourcePicker({
  sources,
  selected,
  setSelected,
}: {
  sources: Source[];
  selected: Id<"sources">[];
  setSelected: (ids: Id<"sources">[]) => void;
}) {
  const [term, setTerm] = useState("");
  return (
    <div className="source-picker">
      <div className="picker-title">
        <span>Ground this in your sources</span>
        <span>{selected.length} / 8 selected</span>
      </div>
      <label className="search">
        <Search size={15} />
        <input
          aria-label="Find sources to include"
          placeholder="Find a source to include…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </label>
      <div className="picker-list">
        {sources
          .filter((s) =>
            `${s.title} ${s.content}`
              .toLowerCase()
              .includes(term.toLowerCase()),
          )
          .map((s) => (
            <label key={s._id}>
              <input
                type="checkbox"
                checked={selected.includes(s._id)}
                disabled={!selected.includes(s._id) && selected.length >= 8}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, s._id]
                      : selected.filter((id) => id !== s._id),
                  )
                }
              />
              <Icon kind={s.kind} />
              <span>{s.title}</span>
              {s.sample && <small>Example</small>}
            </label>
          ))}
        {!sources.length && <p>Save a source to your library first.</p>}
      </div>
    </div>
  );
}
function Evidence({
  citations,
  openSource,
}: {
  citations: Citation[];
  openSource: (id: Id<"sources">) => void;
}) {
  return citations.length ? (
    <details className="evidence">
      <summary>
        <BookOpen size={15} /> {citations.length} verified source{" "}
        {citations.length === 1 ? "quote" : "quotes"} <ChevronRight size={14} />
      </summary>
      <div>
        {citations.map((c, i) => (
          <button
            key={`${c.sourceId}-${i}`}
            onClick={() => openSource(c.sourceId)}
          >
            <span>
              {i + 1}. {c.title}
              <ArrowUpRight size={14} />
            </span>
            <q>{c.quote}</q>
          </button>
        ))}
      </div>
    </details>
  ) : null;
}
function Ask({
  sources,
  openSource,
  notify,
}: {
  sources: Source[];
  openSource: (id: Id<"sources">) => void;
  notify: (s: string) => void;
}) {
  const questions = useQuery(api.learning.questions, {}),
    ask = useMutation(api.learning.ask);
  const [text, setText] = useState(""),
    [selected, setSelected] = useState<Id<"sources">[]>([]),
    [busy, setBusy] = useState(false),
    [showSources, setShowSources] = useState(true);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ask({ text, sourceIds: selected, requestId: requestId() });
      setText("");
      setShowSources(false);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ask-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ANSWERS WITH A WAY BACK</span>
          <h1>
            Ask a better <em>question.</em>
          </h1>
          <p>
            Connect the dots in what you've saved. Every answer starts with your
            sources.
          </p>
        </div>
      </section>
      <form className="ask-composer" onSubmit={submit}>
        <label htmlFor="question">What's on your mind?</label>
        <textarea
          id="question"
          required
          maxLength={2000}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do these ideas have in common? How could I use this in my day?"
        />
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowSources(!showSources)}
          >
            <Layers size={16} />
            {selected.length} sources selected <ChevronRight size={14} />
          </button>
          <button
            className="primary"
            disabled={busy || !selected.length || !text.trim()}
          >
            {busy ? (
              <Busy />
            ) : (
              <>
                Ask my library <ArrowUpRight size={17} />
              </>
            )}
          </button>
        </div>
      </form>
      {showSources && (
        <SourcePicker
          sources={sources}
          selected={selected}
          setSelected={setSelected}
        />
      )}
      <div className="answer-list">
        {questions?.map((q) => (
          <article key={q._id} className="answer-card">
            <div className="eyebrow">
              <MessageCircle size={14} /> YOUR QUESTION
            </div>
            <h2>{q.text}</h2>
            {q.status === "pending" ? (
              <Busy text="Reading your sources and checking the connections…" />
            ) : q.status === "error" ? (
              <p className="error">{q.error}</p>
            ) : (
              <>
                <div className="ai-label">
                  <Sparkles size={14} /> AI synthesis · check the evidence below
                </div>
                <div className="prose">{q.answer}</div>
                <Evidence citations={q.citations} openSource={openSource} />
              </>
            )}
          </article>
        ))}
      </div>
      {!questions?.length && (
        <div className="ask-hint">
          <CircleHelp size={20} />
          <p>
            Start with a question you actually have.
            <br />
            <span>Try “What is one thing I can put into practice today?”</span>
          </p>
        </div>
      )}
    </div>
  );
}
function BeginModal({
  sources,
  initialIds,
  onClose,
  onStarted,
}: {
  sources: Source[];
  initialIds: Id<"sources">[];
  onClose: () => void;
  onStarted: (id: Id<"sessions">) => void;
}) {
  const begin = useMutation(api.learning.begin),
    [goal, setGoal] = useState(""),
    [selected, setSelected] = useState(initialIds),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useRef(requestId());
  return (
    <Modal title="A SMALL MOMENT OF LEARNING" onClose={onClose}>
      <h1>
        Follow a <em>question.</em>
      </h1>
      <p className="muted">
        Choose what you want to understand. We'll work through it together, one
        idea at a time.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onStarted(
              await begin({ goal, sourceIds: selected, requestId: id.current }),
            );
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What would you like to understand?
          <input
            required
            maxLength={300}
            placeholder="e.g. How can I remember more of what I read?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <SourcePicker
          sources={sources}
          selected={selected}
          setSelected={setSelected}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy || !selected.length}>
          {busy ? (
            <Busy text="Starting…" />
          ) : (
            <>
              Let's explore <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
function LearningSession({
  session,
  openSource,
  notify,
  onBack,
}: {
  session: Session;
  openSource: (id: Id<"sources">) => void;
  notify: (s: string) => void;
  onBack: () => void;
}) {
  const turns = useQuery(api.learning.turns, { sessionId: session._id }),
    reply = useMutation(api.learning.reply),
    setState = useMutation(api.learning.setState);
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await reply({ id: session._id, prompt: text, requestId: requestId() });
      setText("");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="learning-page">
      <button className="text-button back" onClick={onBack}>
        <ArrowLeft size={16} /> All learning sessions
      </button>
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            {session.sourceIds.length} SOURCES · YOUR PLACE IS SAVED
          </span>
          <h1>{session.goal}</h1>
        </div>
      </section>
      <div className="session-controls">
        <span>
          <Sprout size={17} />
          {session.state === "completed"
            ? "Finished for now"
            : session.state === "paused"
              ? "Paused — ready when you are"
              : "One idea at a time"}
        </span>
        <div>
          <button
            className="text-button"
            onClick={() =>
              void setState({
                id: session._id,
                state: session.state === "paused" ? "active" : "paused",
              }).catch((e) => notify(errorText(e)))
            }
          >
            {session.state === "paused" ? "Resume" : "Pause"}
          </button>
          <button
            className="text-button"
            onClick={() =>
              void setState({
                id: session._id,
                state: session.state === "completed" ? "active" : "completed",
              }).catch((e) => notify(errorText(e)))
            }
          >
            <Check size={15} />
            {session.state === "completed" ? "Reopen" : "Finish for now"}
          </button>
        </div>
      </div>
      <div className="turns">
        {turns?.map((t, i) => (
          <article className="turn" key={t._id}>
            {i > 0 && (
              <div className="learner-response">
                <span>YOU</span>
                <p>{t.prompt}</p>
              </div>
            )}
            <div className="coach-response">
              <span className="coach-icon">
                <Sprout size={20} />
              </span>
              <div>
                <div className="ai-label">TAUT · AI LEARNING COMPANION</div>
                <div className="prose">{t.answer}</div>
                <Evidence citations={t.citations} openSource={openSource} />
              </div>
            </div>
          </article>
        ))}
      </div>
      {session.busy && (
        <div className="thinking">
          <Busy text="Connecting the ideas in your sources…" />
        </div>
      )}
      {session.error && (
        <p className="error" role="alert">
          {session.error}
        </p>
      )}
      {session.state !== "completed" && (
        <form className="reply-composer" onSubmit={submit}>
          <label htmlFor="response">Your turn. Think out loud.</label>
          <textarea
            id="response"
            rows={3}
            maxLength={3000}
            required
            placeholder="Try an explanation, ask a follow-up, or tell me where you're stuck…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div>
            <small>There is no timer. Take your time.</small>
            <button
              className="primary"
              disabled={busy || session.busy || !text.trim()}
            >
              Continue <ArrowRight size={17} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
function SettingsModal({
  settings,
  onClose,
  notify,
}: {
  settings:
    | {
        openai: boolean;
        firecrawl: boolean;
        mail: boolean;
        inboxId: string | null;
      }
    | undefined;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const createInbox = useAction(api.mail.createInbox),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="YOUR PERSONAL SPACE" onClose={onClose}>
      <h1>
        A place to <em>come back to.</em>
      </h1>
      <p className="muted">
        This early edition keeps your private space signed in on this browser.
        Clearing its data loses access; cross-device accounts are not available
        yet.
      </p>
      <div className="connection-list">
        {[
          ["OpenAI", "Answers & learning", settings?.openai],
          ["Firecrawl", "Readable article imports", settings?.firecrawl],
          ["AgentMail", "Email to your library", settings?.mail],
        ].map(([name, label, connected]) => (
          <div key={String(name)}>
            <span>
              {name}
              <small>{label}</small>
            </span>
            <span className={connected ? "connected" : "muted"}>
              {connected ? (
                <>
                  <Check size={14} /> Configured
                </>
              ) : (
                "Not connected"
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="email-setup">
        <Mail size={26} />
        <h2>Send a good read to your library.</h2>
        <p>
          Forward a newsletter or send a note to your personal capture address.
          Text appears in your library automatically. Attachments aren't
          imported.
        </p>
        {settings?.inboxId ? (
          <>
            <div className="inbox-address">
              <code>{settings.inboxId}</code>
              <button
                className="icon-btn"
                aria-label="Copy capture email address"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(settings.inboxId!)
                    .then(() => notify("Capture address copied."))
                    .catch(() =>
                      notify("Copy unavailable. Select the address manually."),
                    )
                }
              >
                <Copy size={17} />
              </button>
            </div>
            <small>
              Anyone with this address can add to your inbox. Keep it private.
              Incoming mail never sends a reply or starts AI automatically.
            </small>
          </>
        ) : (
          <button
            className="secondary"
            disabled={busy || !settings?.mail}
            onClick={async () => {
              setBusy(true);
              try {
                await createInbox();
                notify("Your capture inbox is ready.");
              } catch (e) {
                notify(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <Busy text="Creating inbox…" />
            ) : (
              <>
                Create my capture inbox <ArrowRight size={16} />
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}
