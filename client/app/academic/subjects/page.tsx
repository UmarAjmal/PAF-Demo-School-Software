'use client';
import { useState, useEffect } from 'react';
import { notify, toast } from '@/app/utils/notify';
import { useAuth } from '@/contexts/AuthContext';

type SubjectItem = {
    subject_id: number;
    subject_name: string;
    subject_code: string;
    section_id: number;
    section_name: string;
    class_id: number;
    class_name: string;
    term_id: number | null;
    term_name: string;
    total_marks?: number;
    passing_marks?: number;
};

type ClassItem = {
    class_id: number;
    class_name: string;
};

type SectionItem = {
    section_id: number;
    section_name: string;
    class_id: number;
};

type TermItem = {
    id: number;
    term_name: string;
    academic_year_id?: number;
    year_name?: string;
};

export default function SubjectSettings() {
    // Data State
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [terms, setTerms] = useState<TermItem[]>([]);

    // UI State
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedTermFilter, setSelectedTermFilter] = useState<string>('ALL');

    // Form State
    const [form, setForm] = useState({
        term_id: '',
        class_id: '',
        subject_name: '',
        subject_code: '',
        section_ids: [] as number[]
    });

    const { hasPermission } = useAuth();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com";

    useEffect(() => {
        // Initialize Bootstrap JS for Accordions
        try {
            require('bootstrap/dist/js/bootstrap.bundle.min.js');
        } catch (e) {
            console.error('Bootstrap JS init error:', e);
        }

        const init = async () => {
            await Promise.all([fetchClasses(), fetchSections(), fetchSubjects(), fetchTerms()]);
            setLoading(false);
        };
        init();
    }, []);

    const fetchClasses = async () => {
        try {
            const res = await fetch(`${API_BASE}/academic`);
            if (res.ok) setClasses(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchSections = async () => {
        try {
            const res = await fetch(`${API_BASE}/academic/sections`);
            if (res.ok) setSections(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchSubjects = async () => {
        try {
            const res = await fetch(`${API_BASE}/academic/subjects`);
            if (res.ok) setSubjects(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchTerms = async () => {
        try {
            let fetchedTerms: TermItem[] = [];
            let res = await fetch(`${API_BASE}/academic/subjects/terms`);
            if (!res.ok) res = await fetch(`${API_BASE}/academic/terms/active`);
            if (!res.ok) res = await fetch(`${API_BASE}/academic/terms-all`);

            if (res.ok) {
                fetchedTerms = await res.json();
                setTerms(fetchedTerms);
                if (fetchedTerms.length > 0) {
                    setForm(prev => prev.term_id ? prev : { ...prev, term_id: fetchedTerms[0].id.toString() });
                }
            }
        } catch (e) { console.error("Fetch terms error:", e); }
    };

    // Derived Data for UI
    const filteredSections = form.class_id
        ? sections.filter(s => s.class_id === Number(form.class_id))
        : [];

    const handleCheckboxChange = (secId: number) => {
        setForm(prev => {
            const exists = prev.section_ids.includes(secId);
            if (exists) {
                return { ...prev, section_ids: prev.section_ids.filter(id => id !== secId) };
            } else {
                if (editMode) {
                    return { ...prev, section_ids: [secId] };
                }
                return { ...prev, section_ids: [...prev.section_ids, secId] };
            }
        });
    };

    const resetForm = () => {
        setForm({
            term_id: '',
            class_id: '',
            subject_name: '',
            subject_code: '',
            section_ids: []
        });
        setEditMode(false);
        setSelectedId(null);
    };

    const handleEdit = (sub: SubjectItem) => {
        setForm({
            term_id: sub.term_id ? sub.term_id.toString() : '',
            class_id: sub.class_id.toString(),
            subject_name: sub.subject_name,
            subject_code: sub.subject_code,
            section_ids: [sub.section_id]
        });
        setEditMode(true);
        setSelectedId(sub.subject_id);
        toast.info("Editing mode enabled", { autoClose: 2000 });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this subject?")) return;

        const toastId = toast.loading("Deleting...");
        try {
            const res = await fetch(`${API_BASE}/academic/subjects/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchSubjects();
                toast.update(toastId, { render: "Subject deleted successfully", type: "success", isLoading: false, autoClose: 3000 });
            } else {
                toast.update(toastId, { render: "Failed to delete subject", type: "error", isLoading: false, autoClose: 3000 });
            }
        } catch (e) {
            toast.update(toastId, { render: "Error deleting subject", type: "error", isLoading: false, autoClose: 3000 });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (form.section_ids.length === 0) {
            notify.error("Please select at least one section");
            return;
        }

        const url = editMode
            ? `${API_BASE}/academic/subjects/${selectedId}`
            : `${API_BASE}/academic/subjects`;

        const method = editMode ? 'PUT' : 'POST';
        const toastId = toast.loading("Processing...");

        let bodyPayload;
        if (editMode) {
            bodyPayload = {
                subject_name: form.subject_name,
                subject_code: form.subject_code,
                section_id: form.section_ids[0],
                term_id: form.term_id || null
            };
        } else {
            bodyPayload = {
                subject_name: form.subject_name,
                subject_code: form.subject_code,
                section_ids: form.section_ids,
                term_id: form.term_id || null
            };
        }

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            if (res.ok) {
                fetchSubjects();
                resetForm();
                toast.update(toastId, {
                    render: editMode ? "Subject updated!" : "Subjects created!",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000
                });
            } else {
                const err = await res.json();
                toast.update(toastId, {
                    render: err.error || "Operation failed",
                    type: "error",
                    isLoading: false,
                    autoClose: 4000
                });
            }
        } catch (err) {
            toast.update(toastId, {
                render: "Server connection error",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        }
    };

    // Filter Subjects by Selected Term
    const filteredSubjectsList = selectedTermFilter === 'ALL'
        ? subjects
        : subjects.filter(sub => (sub.term_name || 'General / All Terms') === selectedTermFilter);

    // Grouping Hierarchy: Term -> Class -> Section -> Subjects
    const groupedData = filteredSubjectsList.reduce((acc, subject) => {
        const termName = subject.term_name || 'General / All Terms';
        const className = subject.class_name;
        const sectionName = subject.section_name;

        if (!acc[termName]) acc[termName] = {};
        if (!acc[termName][className]) acc[termName][className] = {};
        if (!acc[termName][className][sectionName]) acc[termName][className][sectionName] = [];

        acc[termName][className][sectionName].push(subject);
        return acc;
    }, {} as Record<string, Record<string, Record<string, SubjectItem[]>>>);

    // Get unique list of terms for filter buttons
    const availableTermNames = Array.from(new Set(subjects.map(s => s.term_name || 'General / All Terms')));

    if (loading) return (
        <div className="d-flex justify-content-center align-items-center vh-100">
            <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
            </div>
        </div>
    );

    return (
        <div className="container-fluid p-4">
            <h2 className="mb-4 fw-bold animate__animated animate__fadeInDown" style={{ color: 'var(--primary-dark)' }}>
                <i className="bi bi-journal-bookmark-fill me-2"></i>Subject Settings
            </h2>

            <div className="row g-4">
                {/* LEFT COLUMN: FORM */}
                <div className="col-md-4 animate__animated animate__fadeInLeft">
                    <div className="card shadow-lg border-0 rounded-4">
                        <div className="card-header text-white p-3 rounded-top-4" style={{ backgroundColor: 'var(--primary-dark)' }}>
                            <h5 className="mb-0 card-title">
                                {editMode ? 'Edit Subject' : 'Create New Subject'}
                            </h5>
                        </div>
                        <div className="card-body p-4">
                            <form onSubmit={handleSubmit}>
                                {/* Term Selection */}
                                <div className="mb-3">
                                    <label className="form-label fw-bold" style={{ color: 'var(--primary-dark)' }}>
                                        Academic Term <span className="text-danger">*</span>
                                    </label>
                                    <select
                                        className="form-select"
                                        value={form.term_id}
                                        onChange={e => setForm({ ...form, term_id: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Choose Term --</option>
                                        {terms.map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.term_name} {t.year_name ? `(${t.year_name})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <small className="text-muted fs-8 mt-1 d-block">Select the academic term this subject applies to.</small>
                                </div>

                                {/* Class Selection */}
                                <div className="mb-3">
                                    <label className="form-label fw-bold" style={{ color: 'var(--primary-dark)' }}>
                                        Select Class <span className="text-danger">*</span>
                                    </label>
                                    <select
                                        className="form-select"
                                        value={form.class_id}
                                        onChange={e => setForm({ ...form, class_id: e.target.value, section_ids: [] })}
                                        required
                                    >
                                        <option value="">-- Choose Class --</option>
                                        {classes.map(c => (
                                            <option key={c.class_id} value={c.class_id}>
                                                {c.class_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Subject Name */}
                                <div className="mb-3">
                                    <label className="form-label fw-bold" style={{ color: 'var(--primary-dark)' }}>Subject Name</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g. Science"
                                        value={form.subject_name}
                                        onChange={e => setForm({ ...form, subject_name: e.target.value })}
                                        required
                                    />
                                </div>

                                {/* Subject Code */}
                                <div className="mb-3">
                                    <label className="form-label fw-bold" style={{ color: 'var(--primary-dark)' }}>Subject Code</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g. 0004"
                                        value={form.subject_code}
                                        onChange={e => setForm({ ...form, subject_code: e.target.value })}
                                        required
                                    />
                                </div>

                                {/* Sections Selection (Multi-Select) */}
                                <div className="mb-4">
                                    <label className="form-label fw-bold d-block" style={{ color: 'var(--primary-dark)' }}>
                                        Select Sections <small className="text-muted fw-normal">(Multiple Supported)</small>
                                    </label>

                                    <div className="card p-2 bg-light border-0" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {filteredSections.length > 0 ? (
                                            filteredSections.map(s => (
                                                <div key={s.section_id} className="form-check mb-2">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id={`section-${s.section_id}`}
                                                        checked={form.section_ids.includes(s.section_id)}
                                                        onChange={() => handleCheckboxChange(s.section_id)}
                                                    />
                                                    <label className="form-check-label" htmlFor={`section-${s.section_id}`}>
                                                        {s.section_name}
                                                    </label>
                                                </div>
                                            ))
                                        ) : (
                                            <small className="text-muted text-center d-block py-2">
                                                {form.class_id ? "No sections found" : "Select a class first"}
                                            </small>
                                        )}
                                    </div>
                                </div>

                                {hasPermission('academic', 'write') && (
                                    <div className="d-grid gap-2 mt-4">
                                        <button
                                            type="submit"
                                            className="btn btn-lg shadow-sm text-white"
                                            style={{ backgroundColor: editMode ? 'var(--accent-orange)' : 'var(--primary-teal)' }}
                                        >
                                            {editMode ? 'Update Subject' : 'Add Subject(s)'}
                                        </button>
                                        {editMode && (
                                            <button
                                                type="button"
                                                className="btn btn-light border"
                                                onClick={resetForm}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: LIST */}
                <div className="col-md-8 animate__animated animate__fadeInRight">
                    <div className="card shadow-lg border-0 rounded-4">
                        <div className="card-header bg-white p-4 border-bottom-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
                            <h5 className="mb-0 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                                <i className="bi bi-diagram-3-fill me-2" style={{ color: 'var(--primary-teal)' }}></i>
                                Subject List (Term → Class → Section)
                            </h5>

                            {/* Term Filter Pills */}
                            <div className="d-flex flex-wrap gap-1">
                                <button
                                    className={`btn btn-sm ${selectedTermFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => setSelectedTermFilter('ALL')}
                                    style={{ borderRadius: '20px', fontSize: '0.82rem' }}
                                >
                                    All Terms
                                </button>
                                {availableTermNames.map(tn => (
                                    <button
                                        key={tn}
                                        className={`btn btn-sm ${selectedTermFilter === tn ? 'btn-primary' : 'btn-outline-secondary'}`}
                                        onClick={() => setSelectedTermFilter(tn)}
                                        style={{ borderRadius: '20px', fontSize: '0.82rem' }}
                                    >
                                        {tn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="card-body p-3">
                            {/* Term -> Class -> Section -> Subjects Tree View */}
                            <div className="accordion accordion-flush" id="termsAccordion">
                                {Object.keys(groupedData).length === 0 ? (
                                    <div className="text-center p-5 text-muted">
                                        No subjects found for the selected term filter.
                                    </div>
                                ) : (
                                    Object.entries(groupedData).map(([termName, classMap], termIdx) => (
                                        <div className="accordion-item border rounded-3 mb-3 overflow-hidden shadow-sm" key={termName}>
                                            <h2 className="accordion-header">
                                                <button
                                                    className={`accordion-button fw-bold fs-6 ${termIdx !== 0 ? 'collapsed' : ''}`}
                                                    type="button"
                                                    data-bs-toggle="collapse"
                                                    data-bs-target={`#collapseTerm-${termIdx}`}
                                                    style={{ backgroundColor: '#1e3644', color: '#ffffff' }}
                                                >
                                                    <i className="bi bi-calendar2-range-fill me-2 text-warning"></i>
                                                    Term: {termName}
                                                    <span className="badge bg-light text-dark ms-auto me-3 fs-8">
                                                        {Object.values(classMap).reduce((tot, secMap) => tot + Object.values(secMap).reduce((sTot, subs) => sTot + subs.length, 0), 0)} Subjects
                                                    </span>
                                                </button>
                                            </h2>

                                            <div
                                                id={`collapseTerm-${termIdx}`}
                                                className={`accordion-collapse collapse ${termIdx === 0 ? 'show' : ''}`}
                                            >
                                                <div className="accordion-body p-3 bg-light">
                                                    {/* Nested Accordion for Classes */}
                                                    <div className="accordion accordion-flush" id={`classesAccordion-${termIdx}`}>
                                                        {Object.entries(classMap).map(([className, sectionMap], classIdx) => (
                                                            <div className="accordion-item border rounded-3 mb-2 overflow-hidden bg-white" key={className}>
                                                                <h3 className="accordion-header">
                                                                    <button
                                                                        className={`accordion-button py-2.5 px-3 fw-bold ${classIdx !== 0 ? 'collapsed' : ''}`}
                                                                        type="button"
                                                                        data-bs-toggle="collapse"
                                                                        data-bs-target={`#collapseClass-${termIdx}-${classIdx}`}
                                                                        style={{ backgroundColor: '#f0fdf4', color: '#166534' }}
                                                                    >
                                                                        <i className="bi bi-mortarboard-fill me-2" style={{ color: '#15803d' }}></i>
                                                                        {className}
                                                                    </button>
                                                                </h3>

                                                                <div
                                                                    id={`collapseClass-${termIdx}-${classIdx}`}
                                                                    className={`accordion-collapse collapse ${classIdx === 0 ? 'show' : ''}`}
                                                                >
                                                                    <div className="accordion-body p-0">
                                                                        {Object.entries(sectionMap).map(([sectionName, classSubjects]) => (
                                                                            <div key={sectionName} className="p-3 border-bottom bg-white">
                                                                                <div className="d-flex align-items-center justify-content-between mb-2">
                                                                                    <h6 className="fw-bold text-uppercase fs-7 mb-0" style={{ color: 'var(--primary-teal)' }}>
                                                                                        <i className="bi bi-puzzle me-2"></i>
                                                                                        Section: {sectionName}
                                                                                    </h6>
                                                                                    <span className="badge bg-secondary fs-8">
                                                                                        {classSubjects.length} {classSubjects.length === 1 ? 'subject' : 'subjects'}
                                                                                    </span>
                                                                                </div>

                                                                                <div className="table-responsive">
                                                                                    <table className="table table-hover align-middle table-sm border-start border-3 mb-0" style={{ borderColor: 'var(--primary-teal)' }}>
                                                                                        <thead className="table-light">
                                                                                            <tr>
                                                                                                <th className="ps-3">Subject Name</th>
                                                                                                <th>Code</th>
                                                                                                <th>Term</th>
                                                                                                <th className="text-end pe-3">Actions</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {classSubjects.map((sub) => (
                                                                                                <tr key={sub.subject_id}>
                                                                                                    <td className="ps-3 fw-medium">{sub.subject_name}</td>
                                                                                                    <td>
                                                                                                        <span className="badge" style={{ backgroundColor: 'var(--primary-dark)' }}>
                                                                                                            {sub.subject_code}
                                                                                                        </span>
                                                                                                    </td>
                                                                                                    <td>
                                                                                                        <span className="badge bg-info text-dark">
                                                                                                            {sub.term_name || 'General'}
                                                                                                        </span>
                                                                                                    </td>
                                                                                                    <td className="text-end pe-3">
                                                                                                        {hasPermission('academic', 'write') && (
                                                                                                            <button
                                                                                                                className="btn btn-sm btn-outline-warning me-2"
                                                                                                                onClick={() => handleEdit(sub)}
                                                                                                                title="Edit"
                                                                                                            >
                                                                                                                <i className="bi bi-pencil-fill"></i>
                                                                                                            </button>
                                                                                                        )}
                                                                                                        {hasPermission('academic', 'delete') && (
                                                                                                            <button
                                                                                                                className="btn btn-sm btn-outline-danger"
                                                                                                                onClick={() => handleDelete(sub.subject_id)}
                                                                                                                title="Delete"
                                                                                                            >
                                                                                                                <i className="bi bi-trash-fill"></i>
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
