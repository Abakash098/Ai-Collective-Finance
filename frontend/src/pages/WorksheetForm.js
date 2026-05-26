import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Chip, Alert,
  Rating, Slider, CircularProgress
} from '@mui/material';
import { Assignment, Send, Schedule } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';

const WorksheetForm = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    tasks_completed: '',
    tasks_in_progress: '',
    blockers: '',
    tomorrow_plan: '',
    productivity: 4,
    hours_worked: 8,
    mood: 3,
  });
  const [mySheets, setMySheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const fetchMySheets = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/worksheets');
      if (res.ok) setMySheets(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMySheets(); }, []); // eslint-disable-line

  const handle = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.tasks_completed.trim()) { setStatus({ type: 'error', msg: 'Please fill in tasks completed.' }); return; }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await apiFetch('/api/worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setStatus({ type: 'success', msg: '✅ Daily worksheet submitted! Your manager has been notified.' });
        setForm(prev => ({ ...prev, tasks_completed: '', tasks_in_progress: '', blockers: '', tomorrow_plan: '' }));
        fetchMySheets();
      } else {
        const err = await res.json();
        setStatus({ type: 'error', msg: err.error || 'Submission failed' });
      }
    } catch { setStatus({ type: 'error', msg: 'Network error' }); }
    finally { setSubmitting(false); }
  };

  const moodEmoji = ['😞', '😐', '🙂', '😊', '🚀'];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Assignment sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>Daily Worksheet</Typography>
          <Typography variant="body2" color="text.secondary">Submit your daily work update — goes to Owner & Admin</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Form */}
        <Paper sx={{ flex: '0 0 380px', minWidth: 300, p: 3, borderRadius: 3, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <Typography variant="h6" mb={2} color="primary.light" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Send fontSize="small" /> Today's Work Report
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              type="date" label="Date" value={form.date} fullWidth size="small"
              onChange={handle('date')} sx={{ mb: 2 }} InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="✅ Tasks Completed *" multiline rows={3} fullWidth size="small"
              value={form.tasks_completed} onChange={handle('tasks_completed')}
              placeholder="List the tasks you completed today..."
              sx={{ mb: 2 }}
            />
            <TextField
              label="🔄 Tasks In Progress" multiline rows={2} fullWidth size="small"
              value={form.tasks_in_progress} onChange={handle('tasks_in_progress')}
              placeholder="What's still ongoing?"
              sx={{ mb: 2 }}
            />
            <TextField
              label="🚧 Blockers / Issues" multiline rows={2} fullWidth size="small"
              value={form.blockers} onChange={handle('blockers')}
              placeholder="Any blockers or help needed?"
              sx={{ mb: 2 }}
            />
            <TextField
              label="📅 Plan for Tomorrow" multiline rows={2} fullWidth size="small"
              value={form.tomorrow_plan} onChange={handle('tomorrow_plan')}
              placeholder="What will you work on tomorrow?"
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                ⏱️ Hours Worked: <strong>{form.hours_worked}h</strong>
              </Typography>
              <Slider
                value={form.hours_worked} min={1} max={12} step={0.5}
                onChange={(_, v) => setForm(prev => ({ ...prev, hours_worked: v }))}
                marks={[{ value: 4, label: '4h' }, { value: 8, label: '8h' }, { value: 12, label: '12h' }]}
                sx={{ color: '#6366f1' }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                ⚡ Productivity: <strong>{form.productivity}/5</strong>
              </Typography>
              <Rating
                value={form.productivity}
                onChange={(_, v) => setForm(prev => ({ ...prev, productivity: v }))}
                max={5}
                sx={{ '& .MuiRating-iconFilled': { color: '#6366f1' } }}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                😊 Mood: <strong>{moodEmoji[form.mood - 1]}</strong>
              </Typography>
              <Slider
                value={form.mood} min={1} max={5} step={1}
                onChange={(_, v) => setForm(prev => ({ ...prev, mood: v }))}
                marks={moodEmoji.map((e, i) => ({ value: i + 1, label: e }))}
                sx={{ color: '#8b5cf6' }}
              />
            </Box>

            <Button
              type="submit" variant="contained" fullWidth disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Send />}
              sx={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', py: 1.2, borderRadius: 2 }}
            >
              {submitting ? 'Submitting...' : 'Submit Daily Report'}
            </Button>

            {status && <Alert severity={status.type} sx={{ mt: 2 }}>{status.msg}</Alert>}
          </form>
        </Paper>

        {/* My past reports */}
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography variant="h6" mb={2} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Schedule fontSize="small" color="primary" /> My Past Reports
            <Chip label={mySheets.length} size="small" sx={{ ml: 1 }} />
          </Typography>

          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>}

          {!loading && mySheets.length === 0 && (
            <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No reports yet. Submit your first daily report!</Typography>
            </Paper>
          )}

          {mySheets.map((s) => (
            <Paper key={s.id} sx={{ mb: 2, p: 2.5, borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography fontWeight={700} variant="body1">{s.date}</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip label={`${s.hours_worked}h`} size="small" color="info" />
                  <Chip label={`⚡ ${s.productivity}/5`} size="small" color="primary" />
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={0.5}><strong>✅ Done:</strong> {s.tasks_completed}</Typography>
              {s.tasks_in_progress && <Typography variant="body2" color="text.secondary" mb={0.5}><strong>🔄 WIP:</strong> {s.tasks_in_progress}</Typography>}
              {s.blockers && <Typography variant="body2" color="error.light"><strong>🚧 Blocked:</strong> {s.blockers}</Typography>}
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default WorksheetForm;
