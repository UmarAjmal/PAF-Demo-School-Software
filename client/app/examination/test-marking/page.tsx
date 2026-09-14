'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/app/utils/notify';

type TermItem = { id: number; term_name: string };
type ClassItem = { class_id: number; class_name: string };
type SectionItem = { section_id: number; section_name: string; class_id: number };
type SubjectItem = {
    subject_id: number; subject_name: string; subject_code?: string | null;
    section_id: number; class_id: number; term_id?: number | null;
};

type TestPaper = {
    test_id: number; test_name: string; description?: string | null;
    total_marks: number; created_at: string; created_by_name: string;
    marks_entered: number;
};

type StudentMarkRow = {
    student_id: number; first_name: string; last_name: string;
    admission_no?: string | null; roll_no?: string | null;
    test_mark_id?: number | null; obtained_marks?: number | null; remarks?: string | null;
};

type SheetData = {
    test: TestPaper & { class_name: string; section_name: string; subject_name: string };
    readonly: boolean;
    students: StudentMarkRow[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com";

export default function TestMarkingPage() {
    const { user } = useAuth();

    // ── context state ────────────────────────────────────────────────────────
    const [loadingCtx, setLoadingCtx] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [terms, setTerms] = useState<TermItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);

    // ── filter selectors ──────────────────────────────────────────────────────
    const [selTerm, setSelTerm] = useState('');
    const [selClass, setSelClass] = useState('');
    const [selSection, setSelSection] = useState('');
    const [selSubject, setSelSubject] = useState('');

    // ── tests list ───────────────────────────────────────────────────────────
    const [loadingTests, setLoadingTests] = useState(false);
    const [tests, setTests] = useState<TestPaper[]>([]);

    // ── create-test form ─────────────────────────────────────────────────────
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formTotal, setFormTotal] = useState('');
    const [creating, setCreating] = useState(false);

    // ── marking sheet ────────────────────────────────────────────────────────
    const [selectedTest, setSelectedTest] = useState<number | null>(null);
    const [loadingSheet, setLoadingSheet] = useState(false);
    const [sheet, setSheet] = useState<SheetData | null>(null);
    const [obtainedMap, setObtainedMap] = useState<Record<number, string>>({});
    const [remarksMap, setRemarksMap] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const filteredSections = useMemo(() =>
        selClass ? sections.filter(s => s.class_id === Number(selClass)) : [],
        [sections, selClass]
    );

    const filteredSubjects = useMemo(() => {
        if (!selClass || !selSection) return [];
        let list = subjects.filter(s =>
            s.class_id === Number(selClass) && s.section_id === Number(selSection)
        );
        if (list.length === 0) {
            list = subjects.filter(s => s.class_id === Number(selClass));
        }
        const seen = new Set<string>();
        return list.filter(s => {
            const key = (s.subject_name || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [subjects, selClass, selSection]);

    const readyToList = !!(selClass && selSection && selSubject && user?.id);

    const loadContext = async () => {
        if (!user?.id) { setLoadingCtx(false); return; }
        setLoadingCtx(true);
        try {
            const r = await fetch(`${API}/exams/tests/context?user_id=${user.id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load test context');

            setIsAdmin(!!d.is_admin);
            const nextTerms = Array.isArray(d.terms) ? d.terms : [];
            const nextClasses = Array.isArray(d.classes) ? d.classes : [];
            const nextSections = Array.isArray(d.sections) ? d.sections : [];
            const nextSubjects = Array.isArray(d.subjects) ? d.subjects : [];

            setTerms(nextTerms);
            setClasses(nextClasses);
            setSections(nextSections);
            setSubjects(nextSubjects);

            setSelClass(prev => (prev && nextClasses.some((c: ClassItem) => String(c.class_id) === prev) ? prev : nextClasses[0] ? String(nextClasses[0].class_id) : ''));
            setSelTerm(prev => (prev && nextTerms.some((t: TermItem) => String(t.id) === prev) ? prev : nextTerms[0] ? String(nextTerms[0].id) : ''));
        } catch (e: any) {
            notify.error(e.message || 'Failed to load test context');
        } finally {
            setLoadingCtx(false);
        }
    };

    useEffect(() => { loadContext(); }, [user?.id]);

    useEffect(() => {
        setSelSection(''); setSelSubject(''); setTests([]); setSelectedTest(null); setSheet(null);
    }, [selClass]);

    useEffect(() => {
        setSelSubject(''); setTests([]); setSelectedTest(null); setSheet(null);
    }, [selTerm, selSection]);

    useEffect(() => {
        if (filteredSections.length === 1 && !selSection) {
            setSelSection(String(filteredSections[0].section_id));
        }
    }, [filteredSections, selSection]);

    useEffect(() => {
        if (filteredSubjects.length === 1 && !selSubject) {
            setSelSubject(String(filteredSubjects[0].subject_id));
        }
    }, [filteredSubjects, selSubject]);

    const loadTests = async () => {
        if (!readyToList || !user?.id) return;
        setLoadingTests(true);
        try {
            const params = new URLSearchParams({
                user_id: String(user.id),
                class_id: selClass,
                section_id: selSection,
                subject_id: selSubject
            });
            const r = await fetch(`${API}/exams/tests?${params.toString()}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load tests');
            setTests(Array.isArray(d.tests) ? d.tests : []);
        } catch (e: any) {
            setTests([]);
            notify.error(e.message || 'Failed to load tests');
        } finally {
            setLoadingTests(false);
        }
    };

    useEffect(() => {
        if (readyToList) loadTests();
    }, [readyToList, selClass, selSection, selSubject]);

    const handleCreate = async () => {
        if (!readyToList || !user?.id) return;
        if (!formName.trim()) { notify.warning('Please enter test name'); return; }
        const total = Number(formTotal);
        if (!Number.isFinite(total) || total <= 0) { notify.warning('Please enter valid total marks'); return; }

        setCreating(true);
        try {
            const r = await fetch(`${API}/exams/tests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    class_id: Number(selClass),
                    section_id: Number(selSection),
                    subject_id: Number(selSubject),
                    test_name: formName.trim(),
                    description: formDesc.trim() || null,
                    total_marks: total
                })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to create test');

            notify.success('Test created successfully!');
            setFormName(''); setFormDesc(''); setFormTotal(''); setShowCreateForm(false);
            await loadTests();
            if (d.test?.test_id) setSelectedTest(d.test.test_id);
        } catch (e: any) {
            notify.error(e.message || 'Failed to create test');
        } finally {
            setCreating(false);
        }
    };

    const loadSheet = async (testId: number) => {
        if (!user?.id) return;
        setLoadingSheet(true);
        try {
            const r = await fetch(`${API}/exams/tests/${testId}/sheet?user_id=${user.id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load marking sheet');

            const sData = d as SheetData;
            setSheet(sData);

            const oMap: Record<number, string> = {};
            const rMap: Record<number, string> = {};
            for (const s of sData.students) {
                oMap[s.student_id] = s.obtained_marks !== null && s.obtained_marks !== undefined ? String(s.obtained_marks) : '';
                rMap[s.student_id] = s.remarks || '';
            }
            setObtainedMap(oMap);
            setRemarksMap(rMap);
        } catch (e: any) {
            setSheet(null);
            notify.error(e.message || 'Failed to load marking sheet');
        } finally {
            setLoadingSheet(false);
        }
    };

    useEffect(() => {
        if (selectedTest !== null) loadSheet(selectedTest);
        else setSheet(null);
    }, [selectedTest]);

    const handleSaveSheet = async () => {
        if (!selectedTest || !user?.id || !sheet) return;
        setSaving(true);
        try {
            const marksPayload = sheet.students.map(s => {
                const rawObt = obtainedMap[s.student_id];
                const obt = rawObt === '' || rawObt === undefined || rawObt === null ? null : Number(rawObt);
                const rem = (remarksMap[s.student_id] || '').trim();
                return {
                    student_id: s.student_id,
                    obtained_marks: obt,
                    remarks: rem || null
                };
            });

            const r = await fetch(`${API}/exams/tests/${selectedTest}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    marks: marksPayload
                })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to save test marks');

            notify.success(d.message || 'Test marks saved successfully!');
            await loadSheet(selectedTest);
            await loadTests();
        } catch (e: any) {
            notify.error(e.message || 'Failed to save test marks');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTest = async (testId: number) => {
        if (!user?.id) return;
        if (!window.confirm('Delete this test paper and all its entered marks?')) return;
        setDeleting(true);
        try {
            const r = await fetch(`${API}/exams/tests/${testId}?user_id=${user.id}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Delete failed');

            notify.success('Test deleted successfully');
            if (selectedTest === testId) setSelectedTest(null);
            await loadTests();
        } catch (e: any) {
            notify.error(e.message || 'Delete failed');
        } finally {
            setDeleting(false);
        }
    };

    const handleFillZero = () => {
        if (!sheet) return;
        const filled: Record<number, string> = {};
        for (const s of sheet.students) {
            filled[s.student_id] = obtainedMap[s.student_id] !== '' && obtainedMap[s.student_id] !== undefined ? obtainedMap[s.student_id] : '0';
        }
        setObtainedMap(filled);
        notify.success('Empty entries filled with 0');
    };

    const fmtDate = (iso: string) => {
        try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch { return iso; }
    };

    return (
        <div className="page-wrap" style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh', paddingBottom: '3rem' }}>

            {/* Page Header */}
            <div className="d-flex flex-wrap align-items-center justify-content-between mb-4">
                <div>
                    <h4 className="mb-1 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-journal-check me-2" style={{ color: 'var(--accent-orange)' }} />
                        Class Test Marking
                    </h4>
                    <div className="text-muted small">Create chapter tests, quizzes, and enter student test scores</div>
                </div>
            </div>

            {/* Seamless Selection Filter (4 Columns) */}
            <div className="card border-0 shadow-sm mb-4">
                <div className="card-header bg-white border-bottom py-3" style={{ borderLeft: '4px solid var(--primary-dark)' }}>
                    <h6 className="mb-0 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-sliders me-2" style={{ color: 'var(--accent-orange)' }} />
                        Select Class & Subject Target (Auto-loads Tests)
                    </h6>
                </div>
                <div className="card-body p-4">
                    <div className="row g-3">
                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">1</span> Term
                            </label>
                            <select className="form-select form-select-md border-2" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={loadingCtx}>
                                <option value="">-- Choose Term --</option>
                                {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">2</span> Class
                            </label>
                            <select className="form-select form-select-md border-2" value={selClass} onChange={e => setSelClass(e.target.value)} disabled={loadingCtx}>
                                <option value="">-- Choose Class --</option>
                                {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">3</span> Section
                            </label>
                            <select className="form-select form-select-md border-2" value={selSection} onChange={e => setSelSection(e.target.value)} disabled={!selClass || loadingCtx}>
                                <option value="">-- Choose Section --</option>
                                {filteredSections.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">4</span> Subject
                            </label>
                            <select className="form-select form-select-md border-2" value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selSection || loadingCtx}>
                                <option value="">-- Choose Subject --</option>
                                {filteredSubjects.map(s => (
                                    <option key={s.subject_id} value={s.subject_id}>
                                        {s.subject_name}{s.subject_code ? ` (${s.subject_code})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Test Papers List Card */}
            {readyToList && (
                <div className="card border-0 shadow-sm mb-4">
                    <div className="card-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center"
                        style={{ borderLeft: '4px solid var(--primary-teal)' }}>
                        <h6 className="mb-0 fw-bold text-dark d-flex align-items-center">
                            <i className="bi bi-file-earmark-text me-2 text-primary" />
                            Tests & Quizzes
                            {!loadingTests && <span className="ms-2 badge bg-secondary rounded-pill">{tests.length}</span>}
                        </h6>
                        <button
                            className="btn btn-sm btn-dark rounded-pill px-3 fw-bold"
                            onClick={() => setShowCreateForm(v => !v)}
                        >
                            <i className={`bi ${showCreateForm ? 'bi-x-lg' : 'bi-plus-lg'} me-1`} />
                            {showCreateForm ? 'Cancel' : 'New Class Test'}
                        </button>
                    </div>

                    {/* Inline Create Form */}
                    {showCreateForm && (
                        <div className="card-body border-bottom bg-light">
                            <div className="row g-3 align-items-end">
                                <div className="col-md-4">
                                    <label className="form-label fw-semibold small mb-1">Test Name <span className="text-danger">*</span></label>
                                    <input
                                        type="text" className="form-control form-control-sm border-2"
                                        placeholder="e.g. Chapter 4 Quiz"
                                        value={formName} onChange={e => setFormName(e.target.value)}
                                        maxLength={200}
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label fw-semibold small mb-1">Description</label>
                                    <input
                                        type="text" className="form-control form-control-sm border-2"
                                        placeholder="Optional test topics or notes"
                                        value={formDesc} onChange={e => setFormDesc(e.target.value)}
                                    />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label fw-semibold small mb-1">Total Marks <span className="text-danger">*</span></label>
                                    <input
                                        type="text" inputMode="decimal" className="form-control form-control-sm border-2 text-center fw-bold"
                                        placeholder="50"
                                        value={formTotal} onChange={e => setFormTotal(e.target.value.replace(/[^0-9.]/g, ''))}
                                    />
                                </div>
                                <div className="col-md-2">
                                    <button
                                        className="btn btn-success btn-sm fw-bold w-100 rounded-pill"
                                        onClick={handleCreate}
                                        disabled={creating}
                                    >
                                        {creating ? <><span className="spinner-border spinner-border-sm me-1" />Creating...</> : <><i className="bi bi-check2 me-1" />Create Test</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="card-body p-0">
                        {loadingTests ? (
                            <div className="text-center py-5 text-muted">
                                <span className="spinner-border text-primary me-2" />Loading tests list...
                            </div>
                        ) : tests.length === 0 ? (
                            <div className="text-center py-5 text-muted">
                                <i className="bi bi-inbox fs-1 d-block mb-2 text-secondary" />
                                No tests created for this subject yet. Click <strong>New Class Test</strong> to add one.
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-dark">
                                        <tr>
                                            <th style={{ width: 50 }} className="ps-4">#</th>
                                            <th>Test Name</th>
                                            <th>Description</th>
                                            <th className="text-center">Total Marks</th>
                                            <th className="text-center">Marks Entered</th>
                                            <th>Created By</th>
                                            <th>Date</th>
                                            <th className="text-end pe-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tests.map((t, idx) => (
                                            <tr
                                                key={t.test_id}
                                                style={{ cursor: 'pointer' }}
                                                className={selectedTest === t.test_id ? 'table-light' : ''}
                                                onClick={() => setSelectedTest(selectedTest === t.test_id ? null : t.test_id)}
                                            >
                                                <td className="ps-4 text-muted">{idx + 1}</td>
                                                <td className="fw-bold text-dark">
                                                    {t.test_name}
                                                    {selectedTest === t.test_id && <span className="badge bg-primary ms-2">Active</span>}
                                                </td>
                                                <td className="text-muted small">{t.description || '—'}</td>
                                                <td className="text-center">
                                                    <span className="badge bg-dark rounded-pill px-3">{t.total_marks}</span>
                                                </td>
                                                <td className="text-center">
                                                    <span className={`badge rounded-pill ${t.marks_entered > 0 ? 'bg-success' : 'bg-secondary'}`}>
                                                        {t.marks_entered} Students
                                                    </span>
                                                </td>
                                                <td className="small fw-semibold">{t.created_by_name}</td>
                                                <td className="small text-muted">{fmtDate(t.created_at)}</td>
                                                <td className="text-end pe-4" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        className="btn btn-sm btn-outline-primary rounded-pill me-1"
                                                        onClick={() => setSelectedTest(selectedTest === t.test_id ? null : t.test_id)}
                                                    >
                                                        <i className="bi bi-pencil-square me-1" />
                                                        Mark Test
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            className="btn btn-sm btn-outline-danger rounded-pill"
                                                            onClick={() => handleDeleteTest(t.test_id)}
                                                            disabled={deleting}
                                                        >
                                                            <i className="bi bi-trash" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Test Marking Sheet Modal / Card */}
            {selectedTest !== null && (
                <div className="card border-0 shadow-sm">
                    <div className="card-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center"
                        style={{ borderLeft: '4px solid #10b981' }}>
                        <div>
                            <h5 className="mb-0 fw-bold text-dark">
                                <i className="bi bi-pencil-square me-2 text-success" />
                                Marking Test Sheet {sheet?.test.test_name || 'Class Test'}
                            </h5>
                            {sheet && (
                                <div className="text-muted extra-small mt-1">
                                    {sheet.test.class_name} ({sheet.test.section_name}) · Subject: {sheet.test.subject_name} · Total Marks: <strong>{sheet.test.total_marks}</strong>
                                </div>
                            )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            {sheet && !sheet.readonly && (
                                <>
                                    <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={handleFillZero}>
                                        Fill 0s
                                    </button>
                                    <button className="btn btn-success fw-bold px-4 rounded-pill shadow-xs" onClick={handleSaveSheet} disabled={saving}>
                                        {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving...</> : <><i className="bi bi-check-circle-fill me-1" />Save Test Marks</>}
                                    </button>
                                </>
                            )}
                            <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={() => { setSelectedTest(null); setSheet(null); }}>
                                <i className="bi bi-x-lg me-1" />Close
                            </button>
                        </div>
                    </div>

                    <div className="card-body p-0">
                        {loadingSheet ? (
                            <div className="text-center py-5 text-muted">
                                <span className="spinner-border text-primary me-2" />Loading marking sheet...
                            </div>
                        ) : !sheet ? (
                            <div className="text-center py-4 text-muted">Failed to load test sheet.</div>
                        ) : sheet.students.length === 0 ? (
                            <div className="text-center py-5 text-muted">No active students found in this class/section.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-dark">
                                        <tr>
                                            <th style={{ width: 80 }} className="ps-4">Roll No</th>
                                            <th style={{ width: 140 }}>Admission No</th>
                                            <th>Student Name</th>
                                            <th style={{ width: 180 }}>Obtained Marks</th>
                                            <th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sheet.students.map((s) => {
                                            const obtained = obtainedMap[s.student_id] ?? '';
                                            const remarks = remarksMap[s.student_id] ?? '';

                                            return (
                                                <tr key={s.student_id}>
                                                    <td className="ps-4 fw-bold text-dark">{s.roll_no || '—'}</td>
                                                    <td className="text-muted small">{s.admission_no || '—'}</td>
                                                    <td>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <div
                                                                className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold"
                                                                style={{ width: 32, height: 32, fontSize: '0.85rem' }}
                                                            >
                                                                {s.first_name[0]}{s.last_name[0] || ''}
                                                            </div>
                                                            <div className="fw-semibold text-dark">{s.first_name} {s.last_name}</div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="input-group input-group-sm">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className="form-control text-center fw-bold fs-6 border-2"
                                                                placeholder="0.00"
                                                                value={obtained}
                                                                disabled={sheet.readonly || saving}
                                                                onChange={(e) => setObtainedMap(prev => ({ ...prev, [s.student_id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                                                            />
                                                            <span className="input-group-text text-muted extra-small">/ {sheet.test.total_marks}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            placeholder="Add remarks..."
                                                            value={remarks}
                                                            disabled={sheet.readonly || saving}
                                                            onChange={(e) => setRemarksMap(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
