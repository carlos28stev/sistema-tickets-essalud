import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import './styles.css';

type Role = 'SOLICITANTE' | 'TECNICO' | 'ADMIN';
type Status = 'ABIERTO' | 'ASIGNADO' | 'EN_PROGRESO' | 'PENDIENTE_INFORMACION' | 'RESUELTO' | 'CERRADO' | 'CANCELADO';
type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Profile = { uid: string, email: string, displayName: string, role: Role, status: 'ACTIVE' | 'INACTIVE' };
type Ticket = {
  id: string, code: string, requesterId: string, requesterName: string,
  assignedTechnicianId?: string | null, assignedTechnicianName?: string | null,
  establishmentId: string, area: string, title: string, description: string,
  categoryId: string, categoryName: string, priority: Priority, status: Status,
  classificationConfidence: number, classificationSource: string, solution?: string | null
};

const Auth = createContext<{ user: User | null, profile: Profile | null, loading: boolean, login: (e: string, p: string) => Promise<void>, logout: () => Promise<void>, reset: (e: string) => Promise<void> } | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, async u => {
    setUser(u);
    setProfile(null);
    if (u) {
      const s = await getDoc(doc(db, 'users', u.uid));
      if (s.exists()) setProfile({ uid: u.uid, ...s.data() } as Profile);
      else await signOut(auth);
    }
    setLoading(false);
  }), []);
  const value = useMemo(() => ({
    user, profile, loading,
    login: async (e: string, p: string) => { await signInWithEmailAndPassword(auth, e, p); },
    logout: async () => { await signOut(auth); },
    reset: async (e: string) => { await sendPasswordResetEmail(auth, e); }
  }), [user, profile, loading]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}

function useAuth() {
  const x = useContext(Auth);
  if (!x) throw new Error('AuthProvider requerido');
  return x;
}

const rules = [
  ['ESSI', 'Sistemas clínicos', ['essi', 'sistema clínico', 'consulta externa'], 'HIGH'],
  ['NETWORK', 'Conectividad', ['internet', 'red', 'wifi', 'conexión'], 'HIGH'],
  ['PRINTER', 'Impresoras', ['impresora', 'tóner', 'papel', 'no imprime'], 'MEDIUM'],
  ['HARDWARE', 'Hardware', ['computadora', 'equipo', 'monitor', 'lento'], 'MEDIUM'],
  ['ACCESS', 'Accesos y cuentas', ['contraseña', 'usuario bloqueado', 'no puedo ingresar', 'acceso'], 'HIGH']
] as const;

function classify(title: string, description: string, urgency: string) {
  const tx = (title + ' ' + description).toLowerCase();
  let best: any = null, score = 0;
  for (const r of rules) {
    const s = r[2].filter(k => tx.includes(k)).length;
    if (s > score) { best = r; score = s; }
  }
  if (!best) best = ['OTHER', 'Otros', [], 'LOW'];
  let priority = best[3] as Priority;
  if (['emergencia', 'servicio caído', 'múltiples usuarios', 'atención paralizada'].some(x => tx.includes(x))) priority = 'CRITICAL';
  else if (urgency === 'HIGH' && priority === 'MEDIUM') priority = 'HIGH';
  return { categoryId: best[0], categoryName: best[1], priority, confidence: score ? Math.min(.95, .62 + score * .11) : .45 };
}

function code() { return `INC-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`; }

async function createTicket(p: Profile, data: any) {
  const c = classify(data.title, data.description, data.perceivedUrgency);
  const mins = { CRITICAL: 240, HIGH: 480, MEDIUM: 1440, LOW: 2880 }[c.priority];
  const ref = await addDoc(collection(db, 'tickets'), {
    ...data, code: code(), requesterId: p.uid, requesterName: p.displayName,
    assignedTechnicianId: null, assignedTechnicianName: null, ...c,
    classificationSource: 'RULES', status: 'ABIERTO', solution: null,
    slaDueAt: Timestamp.fromDate(new Date(Date.now() + mins * 60000)),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  await addDoc(collection(db, 'ticketHistory'), {
    ticketId: ref.id, actorId: p.uid, actorName: p.displayName,
    eventType: 'TICKET_CREATED', createdAt: serverTimestamp()
  });
  return ref.id;
}

function subTickets(p: Profile, cb: (x: Ticket[]) => void) {
  const q = p.role === 'SOLICITANTE'
    ? query(collection(db, 'tickets'), where('requesterId', '==', p.uid), orderBy('createdAt', 'desc'))
    : query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }) as Ticket)));
}

function Guard({ roles }: { roles?: Role[] }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="center">Cargando...</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function Badge({ v }: { v: string }) {
  return <span className={'badge b-' + v.toLowerCase()}>{v.replaceAll('_', ' ')}</span>;
}

function Layout() {
  const { profile, logout } = useAuth();
  const links = [
    ['/dashboard', 'Dashboard'],
    ['/tickets', 'Tickets'],
    ['/tickets/new', 'Nuevo ticket'],
    ['/kanban', 'Kanban'],
    ['/users', 'Usuarios'],
    ['/reports', 'Reportes']
  ];
  return (
    <div className="app">
      <aside>
        <h2>+ Soporte EsSalud</h2>
        <small>{profile?.role}</small>
        <nav>
          {links.filter(([u]) =>
            !(u === '/tickets/new' && profile?.role !== 'SOLICITANTE') &&
            !(u === '/kanban' && profile?.role === 'SOLICITANTE') &&
            !((u === '/users' || u === '/reports') && profile?.role !== 'ADMIN')
          ).map(([u, l]) => <NavLink key={u} to={u}>{l}</NavLink>)}
        </nav>
        <button onClick={() => void logout()}>Cerrar sesión</button>
      </aside>
      <main>
        <header>
          <b>{profile?.displayName}</b>
          <span>{profile?.email}</span>
        </header>
        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function Login() {
  const { profile, login, reset } = useAuth();
  const [e, setE] = useState('admin@essalud.local');
  const [p, setP] = useState('Admin123*');
  const [err, setErr] = useState('');
  if (profile) return <Navigate to="/dashboard" />;
  return (
    <div className="login">
      <div className="hero">
        <h1>Gestión inteligente de incidentes</h1>
        <p>Tickets, clasificación, SLA y trazabilidad para la Red Asistencial Pasco.</p>
      </div>
      <form onSubmit={async x => { x.preventDefault(); try { await login(e, p); } catch (a) { setErr(a instanceof Error ? a.message : 'Error'); } }}>
        <h2>Iniciar sesión</h2>
        {err && <div className="alert">{err}</div>}
        <label>Correo<input value={e} onChange={x => setE(x.target.value)} /></label>
        <label>Contraseña<input type="password" value={p} onChange={x => setP(x.target.value)} /></label>
        <button>Ingresar</button>
        <a onClick={() => void reset(e)}>Recuperar contraseña</a>
      </form>
    </div>
  );
}

function Dashboard() {
  const { profile } = useAuth();
  const [t, setT] = useState<Ticket[]>([]);
  useEffect(() => profile ? subTickets(profile, setT) : undefined, [profile]);
  const c = {
    total: t.length,
    open: t.filter(x => ['ABIERTO', 'ASIGNADO'].includes(x.status)).length,
    progress: t.filter(x => x.status === 'EN_PROGRESO').length,
    resolved: t.filter(x => ['RESUELTO', 'CERRADO'].includes(x.status)).length
  };
  return (
    <>
      <h1>Dashboard</h1>
      <div className="kpis">
        {Object.entries(c).map(([k, v]) => <article key={k}><span>{k}</span><strong>{v}</strong></article>)}
      </div>
      <div className="panel">
        <h2>Tickets recientes</h2>
        <Table tickets={t.slice(0, 8)} />
      </div>
    </>
  );
}

function Table({ tickets }: { tickets: Ticket[] }) {
  return (
    <table>
      <thead><tr><th>Código</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Técnico</th><th /></tr></thead>
      <tbody>
        {tickets.map(x => (
          <tr key={x.id}>
            <td>{x.code}</td>
            <td>{x.title}</td>
            <td><Badge v={x.priority} /></td>
            <td><Badge v={x.status} /></td>
            <td>{x.assignedTechnicianName || 'Sin asignar'}</td>
            <td><Link to={'/tickets/' + x.id}>Ver</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tickets() {
  const { profile } = useAuth();
  const [t, setT] = useState<Ticket[]>([]);
  const [s, setS] = useState('');
  useEffect(() => profile ? subTickets(profile, setT) : undefined, [profile]);
  return (
    <div className="panel">
      <h1>Tickets</h1>
      <input placeholder="Buscar" value={s} onChange={e => setS(e.target.value)} />
      <Table tickets={t.filter(x => (x.code + x.title).toLowerCase().includes(s.toLowerCase()))} />
    </div>
  );
}

function NewTicket() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ establishmentId: 'HBIP', area: 'Consulta externa', title: '', description: '', perceivedUrgency: 'MEDIUM' });
  const [err, setErr] = useState('');
  return (
    <div className="panel">
      <h1>Registrar ticket</h1>
      <p>No incluya datos clínicos, pacientes ni contraseñas.</p>
      {err && <div className="alert">{err}</div>}
      <form className="grid" onSubmit={async e => {
        e.preventDefault();
        if (!profile) return;
        if (f.title.length < 5 || f.description.length < 20) {
          setErr('Título mínimo 5 y descripción mínima 20 caracteres');
          return;
        }
        const id = await createTicket(profile, f);
        nav('/tickets/' + id);
      }}>
        <label>Establecimiento
          <select value={f.establishmentId} onChange={e => setF({ ...f, establishmentId: e.target.value })}>
            <option value="HBIP">Hospital Base I Pasco</option>
            <option value="CAPOX">CAP Oxapampa</option>
          </select>
        </label>
        <label>Área
          <input value={f.area} onChange={e => setF({ ...f, area: e.target.value })} />
        </label>
        <label className="full">Título
          <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="full">Descripción
          <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        </label>
        <label>Urgencia
          <select value={f.perceivedUrgency} onChange={e => setF({ ...f, perceivedUrgency: e.target.value })}>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Baja</option>
          </select>
        </label>
        <button>Registrar y clasificar</button>
      </form>
    </div>
  );
}

function Kanban() {
  const { profile } = useAuth();
  const [t, setT] = useState<Ticket[]>([]);
  useEffect(() => profile ? subTickets(profile, setT) : undefined, [profile]);
  const cols: Status[] = ['ABIERTO', 'ASIGNADO', 'EN_PROGRESO', 'RESUELTO'];
  return (
    <>
      <h1>Kanban técnico</h1>
      <div className="kanban">
        {cols.map(c => (
          <section key={c}>
            <h3>{c} ({t.filter(x => x.status === c).length})</h3>
            {t.filter(x => x.status === c).map(x => (
              <Link className="card" to={'/tickets/' + x.id} key={x.id}>
                <Badge v={x.priority} />
                <b>{x.code}</b>
                <p>{x.title}</p>
                <small>{x.assignedTechnicianName || 'Sin técnico'}</small>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function Detail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const [t, setT] = useState<Ticket | null>(null);
  const [techs, setTechs] = useState<Profile[]>([]);
  const [comment, setComment] = useState('');
  const [solution, setSolution] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const reload = async () => {
    const s = await getDoc(doc(db, 'tickets', id));
    setT(s.exists() ? { id: s.id, ...s.data() } as Ticket : null);
  };
  useEffect(() => {
    void reload();
    const q = query(collection(db, 'ticketComments'), where('ticketId', '==', id), orderBy('createdAt', 'asc'));
    const u = onSnapshot(q, s => setComments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    if (profile?.role !== 'SOLICITANTE') {
      void getDocs(query(collection(db, 'users'), where('role', '==', 'TECNICO'))).then(s => setTechs(s.docs.map(d => ({ uid: d.id, ...d.data() } as Profile))));
    }
    return u;
  }, [id, profile]);
  if (!t) return <div className="panel">Cargando...</div>;
  const op = profile?.role !== 'SOLICITANTE';
  async function history(type: string, b: any, a: any) {
    if (profile) await addDoc(collection(db, 'ticketHistory'), {
      ticketId: t!.id, actorId: profile.uid, actorName: profile.displayName,
      eventType: type, before: b, after: a, createdAt: serverTimestamp()
    });
  }
  return (
    <div className="detail">
      <div className="panel">
        <h1>{t.code}</h1>
        <div><Badge v={t.priority} /> <Badge v={t.status} /></div>
        <h2>{t.title}</h2>
        <p>{t.description}</p>
        <div className="info">
          <span>Solicitante<b>{t.requesterName}</b></span>
          <span>Categoría<b>{t.categoryName}</b></span>
          <span>Confianza<b>{Math.round(t.classificationConfidence * 100)}%</b></span>
          <span>Técnico<b>{t.assignedTechnicianName || 'Sin asignar'}</b></span>
        </div>
        {op && (
          <>
            <h2>Gestión técnica</h2>
            <label>Asignar técnico
              <select value={t.assignedTechnicianId || ''} onChange={async e => {
                const x = techs.find(z => z.uid === e.target.value);
                if (x) {
                  await updateDoc(doc(db, 'tickets', t.id), {
                    assignedTechnicianId: x.uid,
                    assignedTechnicianName: x.displayName,
                    status: t.status === 'ABIERTO' ? 'ASIGNADO' : t.status,
                    updatedAt: serverTimestamp()
                  });
                  await history('TICKET_ASSIGNED', { assignedTechnicianId: t.assignedTechnicianId }, { assignedTechnicianId: x.uid });
                  await reload();
                }
              }}>
                <option value="">Seleccione</option>
                {techs.map(x => <option value={x.uid} key={x.uid}>{x.displayName}</option>)}
              </select>
            </label>
            <label>Solución
              <textarea value={solution} onChange={e => setSolution(e.target.value)} />
            </label>
            <label>Cambiar estado
              <select value="" onChange={async e => {
                const ns = e.target.value as Status;
                if (ns === 'RESUELTO' && !solution.trim()) {
                  alert('Registre una solución');
                  return;
                }
                await updateDoc(doc(db, 'tickets', t.id), {
                  status: ns,
                  solution: solution || t.solution || null,
                  updatedAt: serverTimestamp()
                });
                await history('STATUS_CHANGED', { status: t.status }, { status: ns });
                if (solution && profile) {
                  await addDoc(collection(db, 'ticketComments'), {
                    ticketId: t.id, authorId: profile.uid, authorName: profile.displayName,
                    type: 'SOLUTION', content: solution, createdAt: serverTimestamp()
                  });
                }
                setSolution('');
                await reload();
              }}>
                <option value="">Seleccione</option>
                {(['ASIGNADO', 'EN_PROGRESO', 'PENDIENTE_INFORMACION', 'RESUELTO', 'CERRADO', 'CANCELADO'] as Status[])
                  .filter(x => x !== t.status)
                  .map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
          </>
        )}
        <h2>Comentarios</h2>
        {comments.map(x => (
          <article className="comment" key={x.id}>
            <b>{x.authorName}</b>
            <small>{x.type}</small>
            <p>{x.content}</p>
          </article>
        ))}
        <form onSubmit={async e => {
          e.preventDefault();
          if (profile && comment.trim()) {
            await addDoc(collection(db, 'ticketComments'), {
              ticketId: t.id, authorId: profile.uid, authorName: profile.displayName,
              type: 'PUBLIC', content: comment, createdAt: serverTimestamp()
            });
            setComment('');
          }
        }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Nuevo comentario" />
          <button>Publicar</button>
        </form>
      </div>
      <aside className="panel">
        <h2>Control</h2>
        <p><b>Área:</b> {t.area}</p>
        <p><b>Origen:</b> {t.classificationSource}</p>
        <p><b>Solución:</b> {t.solution || 'No registrada'}</p>
      </aside>
    </div>
  );
}

function Users() {
  const [u, setU] = useState<Profile[]>([]);
  const [f, setF] = useState({ email: '', password: '', displayName: '', role: 'SOLICITANTE' as Role });
  const load = () => getDocs(collection(db, 'users')).then(s => setU(s.docs.map(d => ({ uid: d.id, ...d.data() } as Profile))));
  useEffect(() => { void load(); }, []);
  return (
    <>
      <div className="panel">
        <h1>Crear usuario</h1>
        <div className="grid">
          <label>Nombre
            <input value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} />
          </label>
          <label>Correo
            <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          </label>
          <label>Contraseña
            <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          </label>
          <label>Rol
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>
              <option>SOLICITANTE</option>
              <option>TECNICO</option>
              <option>ADMIN</option>
            </select>
          </label>
          <button onClick={async () => {
            await httpsCallable(functions, 'createSystemUser')(f);
            setF({ email: '', password: '', displayName: '', role: 'SOLICITANTE' });
            await load();
          }}>Crear usuario</button>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
          <tbody>
            {u.map(x => (
              <tr key={x.uid}>
                <td>{x.displayName}</td>
                <td>{x.email}</td>
                <td>{x.role}</td>
                <td>{x.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Reports() {
  const { profile } = useAuth();
  const [t, setT] = useState<Ticket[]>([]);
  useEffect(() => profile ? subTickets(profile, setT) : undefined, [profile]);
  return (
    <>
      <h1>Reportes básicos</h1>
      <div className="kpis">
        <article><span>Total</span><strong>{t.length}</strong></article>
        <article><span>Críticos</span><strong>{t.filter(x => x.priority === 'CRITICAL').length}</strong></article>
        <article><span>Resueltos</span><strong>{t.filter(x => ['RESUELTO', 'CERRADO'].includes(x.status)).length}</strong></article>
        <article><span>Sin asignar</span><strong>{t.filter(x => !x.assignedTechnicianId).length}</strong></article>
      </div>
    </>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<Detail />} />
          <Route element={<Guard roles={['SOLICITANTE']} />}>
            <Route path="/tickets/new" element={<NewTicket />} />
          </Route>
          <Route element={<Guard roles={['TECNICO', 'ADMIN']} />}>
            <Route path="/kanban" element={<Kanban />} />
          </Route>
          <Route element={<Guard roles={['ADMIN']} />}>
            <Route path="/users" element={<Users />} />
            <Route path="/reports" element={<Reports />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);