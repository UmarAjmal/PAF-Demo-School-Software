'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/app/utils/notify';

type Term = { id: number; term_name: string; start_date?: string | null; end_date?: string | null };
type ClassItem = { class_id: number; class_name: string };
type SectionItem = { section_id: number; section_name: string; class_id: number };
type SubjectItem = {
    subject_id: number;
    subject_name: string;
    subject_code?: string | null;
    term_id?: number | null;
    section_id: number;
    section_name: string;
    class_id: number;
    class_name: string;
};
type StudentMarkRow = {
    student_id: number;
    first_name: string;
    last_name: string;
    admission_no?: string | null;
    roll_no?: string | null;
    mark_id?: number | null;
    total_marks?: number | null;
    obtained_marks?: number | null;
};

type SheetResponse = {
    readonly: boolean;
    has_any_marks: boolean;
    total_marks: number | null;
    students: StudentMarkRow[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com";

export default function ExaminationMarksPage() {
    const { user, hasPermission } = useAuth();

    const [loadingContext, setLoadingContext] = useState(true);
    const [loadingSheet, setLoadingSheet] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [isAdmin, setIsAdmin] = useState(false);
    const [activeYearName, setActiveYearName] = useState('');
    const [terms, setTerms] = useState<Term[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);

    const [selectedTerm, setSelectedTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');

    const [sheetReadonly, setSheetReadonly] = useState(false);
    const [sheetHasAnyMarks, setSheetHasAnyMarks] = useState(false);
    const [totalMarks, setTotalMarks] = useState('100');
    const [students, setStudents] = useState<StudentMarkRow[]>([]);
    const [obtainedMap, setObtainedMap] = useState<Record<number, string>>({});
    const [searchQuery, setSearchQuery] = useState('');

    const canUsePage = !!user;

    const filteredSections = useMemo(() => {
        if (!selectedClass) return [];
        return sections.filter(s => s.class_id === Number(selectedClass));
    }, [sections, selectedClass]);

    const filteredSubjects = useMemo(() => {
        if (!selectedClass || !selectedSection) return [];
        let list = subjects.filter(s =>
            s.class_id === Number(selectedClass) && s.section_id === Number(selectedSection)
        );
        if (list.length === 0) {
            list = subjects.filter(s => s.class_id === Number(selectedClass));
        }
        const seen = new Set<string>();
        return list.filter(s => {
            const key = (s.subject_name || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [subjects, selectedClass, selectedSection]);

    const readyToLoadSheet = !!(selectedTerm && selectedClass && selectedSection && selectedSubject && user?.id);

    const loadContext = async () => {
        if (!user?.id) {
            setLoadingContext(false);
            return;
        }
        setLoadingContext(true);
        try {
            const r = await fetch(`${API}/exams/context?user_id=${user.id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load examination context');

            setIsAdmin(!!d.is_admin);
            setActiveYearName(d.active_year?.year_name || '');
            const nextTerms = Array.isArray(d.terms) ? d.terms : [];
            const nextClasses = Array.isArray(d.classes) ? d.classes : [];
            const nextSections = Array.isArray(d.sections) ? d.sections : [];
            const nextSubjects = Array.isArray(d.subjects) ? d.subjects : [];

            setTerms(nextTerms);
            setClasses(nextClasses);
            setSections(nextSections);
            setSubjects(nextSubjects);

            setSelectedTerm((prev) => {
                if (prev && nextTerms.some((t: Term) => String(t.id) === prev)) return prev;
                return nextTerms.length > 0 ? String(nextTerms[0].id) : '';
            });

            setSelectedClass((prev) => {
                if (prev && nextClasses.some((c: ClassItem) => String(c.class_id) === prev)) return prev;
                return nextClasses.length > 0 ? String(nextClasses[0].class_id) : '';
            });
        } catch (e: any) {
            notify.error(e.message || 'Failed to load examination context');
        } finally {
            setLoadingContext(false);
        }
    };

    useEffect(() => {
        loadContext();
    }, [user?.id]);

    useEffect(() => {
        setSelectedSection('');
        setSelectedSubject('');
        setStudents([]);
        setObtainedMap({});
    }, [selectedClass]);

    useEffect(() => {
        setSelectedSubject('');
        setStudents([]);
        setObtainedMap({});
    }, [selectedTerm, selectedSection]);

    useEffect(() => {
        if (filteredSections.length === 1 && !selectedSection) {
            setSelectedSection(String(filteredSections[0].section_id));
        }
    }, [filteredSections, selectedSection]);

    useEffect(() => {
        if (filteredSubjects.length === 1 && !selectedSubject) {
            setSelectedSubject(String(filteredSubjects[0].subject_id));
        }
    }, [filteredSubjects, selectedSubject]);

    const loadSheet = async () => {
        if (!readyToLoadSheet || !user?.id) return;
        setLoadingSheet(true);
        try {
            const params = new URLSearchParams({
                user_id: String(user.id),
                term_id: selectedTerm,
                class_id: selectedClass,
                section_id: selectedSection,
                subject_id: selectedSubject
            });
            const r = await fetch(`${API}/exams/marks/sheet?${params.toString()}`);
            let d: any = {};
            try {
                d = await r.json();
            } catch {
                throw new Error(`Server returned HTTP ${r.status}. Please refresh after deployment.`);
            }
            if (!r.ok) throw new Error(d.error || 'Failed to load marks sheet');

            setSheetReadonly(!!d.readonly);
            setSheetHasAnyMarks(!!d.has_any_marks);
            setTotalMarks(d.total_marks !== null && d.total_marks !== undefined ? String(d.total_marks) : '100');

            const list = Array.isArray(d.students) ? d.students : [];
            setStudents(list);

            const map: Record<number, string> = {};
            for (const s of list) {
                map[s.student_id] = s.obtained_marks !== null && s.obtained_marks !== undefined ? String(s.obtained_marks) : '';
            }
            setObtainedMap(map);
        } catch (e: any) {
            setStudents([]);
            setObtainedMap({});
            notify.error(e.message || 'Failed to load marks sheet');
        } finally {
            setLoadingSheet(false);
        }
    };

    useEffect(() => {
        if (readyToLoadSheet) {
            loadSheet();
        }
    }, [readyToLoadSheet, selectedTerm, selectedClass, selectedSection, selectedSubject]);

    const handleObtainedChange = (studentId: number, val: string) => {
        setObtainedMap(prev => ({ ...prev, [studentId]: val }));
    };

    const handleSave = async () => {
        if (!user?.id || !readyToLoadSheet) return;
        const tm = Number(totalMarks);
        if (!Number.isFinite(tm) || tm <= 0) {
            notify.error('Total marks must be a valid positive number');
            return;
        }

        setSaving(true);
        try {
            const payloadMarks = students.map(s => {
                const raw = obtainedMap[s.student_id];
                const obtained = raw === '' || raw === undefined || raw === null ? null : Number(raw);
                return {
                    student_id: s.student_id,
                    obtained_marks: obtained
                };
            });

            const r = await fetch(`${API}/exams/marks/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    term_id: Number(selectedTerm),
                    class_id: Number(selectedClass),
                    section_id: Number(selectedSection),
                    subject_id: Number(selectedSubject),
                    total_marks: tm,
                    marks: payloadMarks
                })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to save marks');

            notify.success(d.message || 'Marks saved & submitted for approval.');
            await loadSheet();
        } catch (e: any) {
            notify.error(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSheet = async () => {
        if (!user?.id || !readyToLoadSheet) return;
        if (!window.confirm('Delete this complete marks sheet? This will remove all student marks for selected term/class/section/subject.')) return;

        setDeleting(true);
        try {
            const params = new URLSearchParams({
                user_id: String(user.id),
                term_id: selectedTerm,
                class_id: selectedClass,
                section_id: selectedSection,
                subject_id: selectedSubject
            });
            const r = await fetch(`${API}/exams/marks/sheet?${params.toString()}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Delete failed');

            notify.success(d.message || 'Marks sheet deleted successfully.');
            await loadSheet();
        } catch (e: any) {
            notify.error(e.message || 'Delete failed');
        } finally {
            setDeleting(false);
        }
    };

    // ── Quick Fill Helpers ───────────────────────────────────────────────────
    const handleClearAll = () => {
        if (!window.confirm('Clear all entered marks on this screen?')) return;
        const cleared: Record<number, string> = {};
        for (const s of students) cleared[s.student_id] = '';
        setObtainedMap(cleared);
        notify.warning('All marks cleared on form.');
    };

    const handleFillZero = () => {
        const filled: Record<number, string> = {};
        for (const s of students) {
            filled[s.student_id] = obtainedMap[s.student_id] !== '' && obtainedMap[s.student_id] !== undefined ? obtainedMap[s.student_id] : '0';
        }
        setObtainedMap(filled);
        notify.success('Empty entries filled with 0.');
    };

    // ── Filtered Students Search ─────────────────────────────────────────────
    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return students;
        const q = searchQuery.toLowerCase();
        return students.filter(s =>
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
            (s.roll_no && s.roll_no.toLowerCase().includes(q)) ||
            (s.admission_no && s.admission_no.toLowerCase().includes(q))
        );
    }, [students, searchQuery]);

    // ── Stats Calculations ───────────────────────────────────────────────────
    const enteredCount = useMemo(() => {
        return students.filter(s => obtainedMap[s.student_id] !== '' && obtainedMap[s.student_id] !== undefined).length;
    }, [students, obtainedMap]);

    const stats = useMemo(() => {
        const nums = students
            .map(s => Number(obtainedMap[s.student_id]))
            .filter(n => Number.isFinite(n));
        if (!nums.length) return { avg: 0, highest: 0, lowest: 0 };
        const sum = nums.reduce((a, b) => a + b, 0);
        return {
            avg: +(sum / nums.length).toFixed(2),
            highest: Math.max(...nums),
            lowest: Math.min(...nums)
        };
    }, [students, obtainedMap]);

    if (!canUsePage) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger mb-0">You do not have permission to access Examination Marks.</div>
            </div>
        );
    }

    const maxMarksNum = Number(totalMarks) || 100;

    return (
        <div className="page-wrap" style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh', paddingBottom: '3rem' }}>

            {/* ── Page Header ─────────────────────────────────────────────── */}
            <div className="d-flex flex-wrap align-items-center justify-content-between mb-4">
                <div>
                    <h4 className="mb-1 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-pencil-square me-2" style={{ color: 'var(--accent-orange)' }} />
                        Term Examination Marks Entry
                    </h4>
                    <div className="text-muted small">
                        Enter subject marks step-by-step per term. Saved marks automatically enter approval workflow.
                    </div>
                </div>

                <div className="d-flex align-items-center gap-2 mt-2 mt-md-0">
                    <span className="badge rounded-pill bg-dark text-white px-3 py-2 border shadow-xs">
                        <i className="bi bi-calendar3 me-1" />
                        Session: {activeYearName || 'Active Year'}
                    </span>
                    <span className="badge rounded-pill bg-primary text-white px-3 py-2 border shadow-xs">
                        <i className="bi bi-shield-lock me-1" />
                        Approval Workflow Active
                    </span>
                </div>
            </div>

            {/* ── Seamless Selection Bar (4 Columns) ─────────────────────── */}
            <div className="card border-0 shadow-sm mb-4">
                <div className="card-header bg-white border-bottom py-3" style={{ borderLeft: '4px solid var(--primary-dark)' }}>
                    <h6 className="mb-0 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-sliders me-2" style={{ color: 'var(--accent-orange)' }} />
                        Select Marking Target (Auto-loads Students)
                    </h6>
                </div>
                <div className="card-body p-4">
                    <div className="row g-3">
                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">1</span> Term
                            </label>
                            <select
                                className="form-select form-select-md border-2"
                                value={selectedTerm}
                                onChange={(e) => setSelectedTerm(e.target.value)}
                                disabled={loadingContext}
                            >
                                <option value="">-- Select Term --</option>
                                {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">2</span> Class
                            </label>
                            <select
                                className="form-select form-select-md border-2"
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                disabled={loadingContext}
                            >
                                <option value="">-- Select Class --</option>
                                {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">3</span> Section
                            </label>
                            <select
                                className="form-select form-select-md border-2"
                                value={selectedSection}
                                onChange={(e) => setSelectedSection(e.target.value)}
                                disabled={!selectedClass || loadingContext}
                            >
                                <option value="">-- Select Section --</option>
                                {filteredSections.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
                            </select>
                        </div>

                        <div className="col-md-3 col-6">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">4</span> Subject
                            </label>
                            <select
                                className="form-select form-select-md border-2"
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                disabled={!selectedSection || loadingContext}
                            >
                                <option value="">-- Select Subject --</option>
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

            {/* ── Main Marking Sheet Area ─────────────────────────────────── */}
            {readyToLoadSheet && (
                <div className="card border-0 shadow-sm">
                    {/* Header Controls Bar */}
                    <div className="card-header bg-white border-bottom p-3 d-flex flex-wrap align-items-center justify-content-between gap-3" style={{ borderLeft: '4px solid #10b981' }}>
                        <div>
                            <h5 className="mb-0 fw-bold text-dark">
                                <i className="bi bi-file-earmark-spreadsheet me-2 text-success" />
                                Marking Sheet {students.length} Students
                            </h5>
                            <div className="text-muted extra-small">
                                Enter student marks below. Saved marks will enter approval workflow before publishing.
                            </div>
                        </div>

                        <div className="d-flex flex-wrap align-items-center gap-2">
                            {/* Total Out-of Marks Box */}
                            <div className="input-group input-group-sm" style={{ width: '170px' }}>
                                <span className="input-group-text bg-dark text-white fw-bold">Out of</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="form-control fw-bold text-center"
                                    value={totalMarks}
                                    onChange={(e) => setTotalMarks(e.target.value.replace(/[^0-9.]/g, ''))}
                                    disabled={sheetReadonly || saving || loadingSheet}
                                />
                            </div>

                            {/* Quick Helpers */}
                            {!sheetReadonly && students.length > 0 && (
                                <>
                                    <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={handleFillZero} title="Fill empty rows with 0">
                                        Fill 0s
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger rounded-pill" onClick={handleClearAll} title="Clear form entries">
                                        Clear
                                    </button>
                                </>
                            )}

                            {/* Save Marks Button */}
                            {!sheetReadonly && hasPermission('academic', 'write') && (
                                <button
                                    className="btn btn-success fw-bold px-4 rounded-pill shadow-xs"
                                    onClick={handleSave}
                                    disabled={saving || loadingSheet || students.length === 0}
                                >
                                    {saving ? (
                                        <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
                                    ) : (
                                        <><i className="bi bi-check-circle-fill me-1" />Save & Submit Sheet</>
                                    )}
                                </button>
                            )}

                            {isAdmin && sheetHasAnyMarks && hasPermission('academic', 'delete') && (
                                <button className="btn btn-outline-danger btn-sm rounded-pill" onClick={handleDeleteSheet} disabled={deleting || loadingSheet}>
                                    {deleting ? 'Deleting...' : 'Delete Sheet'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="card-body p-0">
                        {sheetReadonly && (
                            <div className="alert alert-warning m-3 mb-0 border-0 shadow-sm">
                                <i className="bi bi-lock-fill me-2" />
                                This marks sheet is currently locked or approved. You can view marks in read-only mode.
                            </div>
                        )}

                        {/* Live Statistics & Progress Widgets */}
                        {students.length > 0 && (
                            <div className="p-3 bg-light border-bottom">
                                <div className="row g-3 text-center">
                                    <div className="col-md-3 col-6">
                                        <div className="p-2 bg-white rounded shadow-xs border">
                                            <div className="text-muted extra-small fw-semibold text-uppercase">Total Students</div>
                                            <div className="fs-5 fw-bold text-dark">{students.length}</div>
                                        </div>
                                    </div>

                                    <div className="col-md-3 col-6">
                                        <div className="p-2 bg-white rounded shadow-xs border">
                                            <div className="text-muted extra-small fw-semibold text-uppercase">Marks Entered</div>
                                            <div className="fs-5 fw-bold text-primary">
                                                {enteredCount} / {students.length}
                                                <span className="small text-muted ms-1">({Math.round((enteredCount / (students.length || 1)) * 100)}%)</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-md-3 col-6">
                                        <div className="p-2 bg-white rounded shadow-xs border">
                                            <div className="text-muted extra-small fw-semibold text-uppercase">Class Average</div>
                                            <div className="fs-5 fw-bold text-success">{stats.avg} / {totalMarks}</div>
                                        </div>
                                    </div>

                                    <div className="col-md-3 col-6">
                                        <div className="p-2 bg-white rounded shadow-xs border">
                                            <div className="text-muted extra-small fw-semibold text-uppercase">Highest / Lowest</div>
                                            <div className="fs-5 fw-bold text-indigo">
                                                <span className="text-success">{stats.highest}</span>
                                                <span className="text-muted mx-1">/</span>
                                                <span className="text-danger">{stats.lowest}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Filter Search inside Sheet */}
                                <div className="mt-3">
                                    <div className="input-group input-group-sm">
                                        <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Search student by name, roll no, or admission no..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Student Marks Table */}
                        {loadingSheet ? (
                            <div className="text-center py-5">
                                <div className="spinner-border text-primary" role="status" />
                                <div className="text-muted small mt-2">Loading marking sheet...</div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="text-center py-5 text-muted">
                                <i className="bi bi-people fs-1 d-block mb-2 text-secondary" />
                                No active students found for selected class & section.
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-dark">
                                        <tr>
                                            <th style={{ width: '80px' }} className="ps-4">Roll No</th>
                                            <th style={{ width: '140px' }}>Admission No</th>
                                            <th>Student Name</th>
                                            <th style={{ width: '200px' }}>Obtained Marks</th>
                                            <th style={{ width: '130px' }} className="text-center">Percentage</th>
                                            <th className="text-end pe-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s) => {
                                            const rawVal = obtainedMap[s.student_id] ?? '';
                                            const numVal = Number(rawVal);
                                            const hasVal = rawVal !== '';
                                            const pct = hasVal && Number.isFinite(numVal) && maxMarksNum > 0
                                                ? Math.min(100, Math.max(0, +((numVal / maxMarksNum) * 100).toFixed(1)))
                                                : null;

                                            return (
                                                <tr key={s.student_id} className={hasVal ? 'table-light' : ''}>
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
                                                            <div>
                                                                <div className="fw-semibold text-dark">{s.first_name} {s.last_name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="input-group input-group-sm">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className={`form-control form-control-sm text-center fw-bold fs-6 ${hasVal ? 'border-primary bg-white' : ''}`}
                                                                placeholder="0.00"
                                                                value={rawVal}
                                                                disabled={sheetReadonly || saving || loadingSheet}
                                                                onChange={(e) => handleObtainedChange(s.student_id, e.target.value.replace(/[^0-9.]/g, ''))}
                                                            />
                                                            <span className="input-group-text text-muted extra-small">/ {totalMarks}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-center">
                                                        {pct !== null ? (
                                                            <span className={`badge ${pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-danger'}`}>
                                                                {pct}%
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted extra-small">—</span>
                                                        )}
                                                    </td>
                                                    <td className="text-end pe-4">
                                                        {hasVal ? (
                                                            <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">
                                                                <i className="bi bi-check-circle me-1" />Entered
                                                            </span>
                                                        ) : (
                                                            <span className="badge bg-light text-muted border">
                                                                Pending
                                                            </span>
                                                        )}
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
