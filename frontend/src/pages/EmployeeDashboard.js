import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, MenuItem, Chip, Alert,
  Avatar, Divider, Badge, InputAdornment, CircularProgress
} from '@mui/material';
import { Send, Lock, Inbox, Person, Reply as ReplyIcon, AccessTime } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MANAGER_ROLES = ['FIN', 'OWN', 'ADM'];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function initials(str = '') {
  return str.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}

// ─── Employee private thread view ────────────────────────────────────────────
function EmployeeView({ user, apiFetch }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState('FIN');
  const [queries, setQueries] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMyQueries = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/queries');
      if (res.ok) setQueries(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMyQueries(); }, []); // eslint-disable-line

  const handleSend = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await apiFetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, recipient_role: recipient })
      });
      if (res.ok) {
        setSubject(''); setMessage('');
        setStatus('success');
        fetchMyQueries();
      } else setStatus('error');
    } catch { setStatus('error'); }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Lock sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>Secure Message Center</Typography>
          <Typography variant="body2" color="text.secondary">
            Your private encrypted channel with Finance & Management
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Compose Form */}
        <Paper sx={{
          p: 3, flex: '0 0 320px', minWidth: 280,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.04) 100%)',
          border: '1px solid rgba(99,102,241,0.2)', borderRadius: 3
        }}>
          <Typography variant="h6" mb={2} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#a5b4fc' }}>
            <Send fontSize="small" /> New Encrypted Message
          </Typography>
          <form onSubmit={handleSend}>
            <TextField
              select label="Send To" value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              fullWidth size="small" sx={{ mb: 2 }}
            >
              <MenuItem value="FIN">💼 Finance Team</MenuItem>
              <MenuItem value="OWN">👑 Founder / Owner</MenuItem>
            </TextField>
            <TextField
              label="Subject" value={subject} required
              onChange={(e) => setSubject(e.target.value)}
              fullWidth size="small" sx={{ mb: 2 }}
            />
            <TextField
              label="Your Message" value={message} required multiline rows={5}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth size="small" sx={{ mb: 2 }}
              placeholder="Write your query, salary request, or any HR matter..."
            />
            <Button
              type="submit" variant="contained" fullWidth
              startIcon={<Lock fontSize="small" />}
              sx={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', py: 1.2, borderRadius: 2 }}
            >
              Send Encrypted Message
            </Button>
            {status === 'success' && <Alert severity="success" sx={{ mt: 2 }}>✅ Message delivered securely!</Alert>}
            {status === 'error' && <Alert severity="error" sx={{ mt: 2 }}>❌ Failed to send. Please retry.</Alert>}
          </form>
        </Paper>

        {/* My Thread */}
        <Box sx={{ flex: 1, minWidth: 300 }}>
          <Typography variant="h6" mb={2} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Lock fontSize="small" color="primary" /> My Private Thread
            <Chip label={`${queries.length} message${queries.length !== 1 ? 's' : ''}`} size="small" sx={{ ml: 1 }} />
          </Typography>

          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>}

          {!loading && queries.length === 0 && (
            <Paper sx={{ p: 4, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
              <Lock sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No messages yet. Send your first secure message!</Typography>
            </Paper>
          )}

          {queries.map((q) => (
            <Paper key={q.id} sx={{
              mb: 2, borderRadius: 3, overflow: 'hidden',
              border: q.status === 'Answered'
                ? '1px solid rgba(34,197,94,0.3)'
                : '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)'
            }}>
              {/* Message header */}
              <Box sx={{ p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography fontWeight={600}>{q.subject}</Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                    <AccessTime sx={{ fontSize: 12 }} /> {formatTime(q.created_at)} &nbsp;→&nbsp;
                    {q.recipient_role === 'FIN' ? '💼 Finance' : '👑 Owner'}
                  </Typography>
                </Box>
                <Chip
                  label={q.status === 'Answered' ? '✓ Replied' : '⏳ Pending'}
                  size="small"
                  color={q.status === 'Answered' ? 'success' : 'warning'}
                />
              </Box>

              {/* Your message bubble */}
              <Box sx={{ mx: 2, mb: 1.5, p: 2, backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 2, borderLeft: '3px solid #6366f1' }}>
                <Typography variant="caption" color="primary.light" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                  You
                </Typography>
                <Typography variant="body2">{q.message}</Typography>
              </Box>

              {/* Reply bubble */}
              {q.response && (
                <Box sx={{ mx: 2, mb: 2, p: 2, backgroundColor: 'rgba(34,197,94,0.07)', borderRadius: 2, borderLeft: '3px solid #22c55e' }}>
                  <Typography variant="caption" color="success.light" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                    {q.recipient_role === 'FIN' ? '💼 Finance Team' : '👑 Owner / Founder'}
                  </Typography>
                  <Typography variant="body2">{q.response}</Typography>
                </Box>
              )}
              {!q.response && (
                <Box sx={{ mx: 2, mb: 2, p: 1.5, borderRadius: 2, border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <Typography variant="caption" color="text.disabled">⏳ Awaiting reply from {q.recipient_role === 'FIN' ? 'Finance' : 'Owner'}...</Typography>
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Manager inbox view (Finance / Owner sees ALL employees) ─────────────────
function ManagerView({ user, apiFetch }) {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState({});
  const [replyStatus, setReplyStatus] = useState({});
  const [selectedSender, setSelectedSender] = useState(null);

  const fetchQueries = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/queries?viewAs=${user.role}`);
      if (res.ok) setQueries(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchQueries(); }, []); // eslint-disable-line

  const handleReply = async (id) => {
    if (!replyText[id]?.trim()) return;
    setReplyStatus(prev => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await apiFetch(`/api/queries/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: replyText[id] })
      });
      if (res.ok) {
        setReplyText(prev => ({ ...prev, [id]: '' }));
        setReplyStatus(prev => ({ ...prev, [id]: 'done' }));
        fetchQueries();
      }
    } catch { setReplyStatus(prev => ({ ...prev, [id]: 'error' })); }
  };

  // Group queries by employee_id
  const senders = [...new Set(queries.map(q => q.employee_id))];
  const selectedQueries = selectedSender
    ? queries.filter(q => q.employee_id === selectedSender)
    : [];
  const unreadCount = (id) => queries.filter(q => q.employee_id === id && q.status !== 'Answered').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Inbox sx={{ color: '#6366f1', fontSize: 28 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {user.role === 'FIN' ? '💼 Finance Inbox' : '👑 Owner Inbox'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {queries.length} message{queries.length !== 1 ? 's' : ''} from {senders.length} employee{senders.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
      </Box>

      {loading && <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}

      {!loading && queries.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
          <Inbox sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography color="text.secondary" variant="h6">Inbox is empty</Typography>
          <Typography variant="body2" color="text.disabled">No employee queries yet.</Typography>
        </Paper>
      )}

      {!loading && queries.length > 0 && (
        <Box sx={{ display: 'flex', gap: 3, height: '70vh', minHeight: 500 }}>
          {/* Sender list sidebar */}
          <Paper sx={{
            width: 220, flexShrink: 0,
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'auto'
          }}>
            <Typography variant="caption" color="text.disabled" sx={{ px: 2, py: 1.5, display: 'block', fontWeight: 600, letterSpacing: 1 }}>
              EMPLOYEES
            </Typography>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
            {senders.map((senderId) => {
              const count = unreadCount(senderId);
              const isSelected = selectedSender === senderId;
              const shortId = senderId.split('_').pop().slice(0, 8);
              return (
                <Box
                  key={senderId}
                  onClick={() => setSelectedSender(senderId)}
                  sx={{
                    px: 2, py: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5,
                    backgroundColor: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                    '&:hover': { backgroundColor: 'rgba(99,102,241,0.08)' }
                  }}
                >
                  <Avatar sx={{ width: 34, height: 34, bgcolor: '#4f46e5', fontSize: 12 }}>
                    {initials(shortId)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      Emp #{shortId}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {queries.filter(q => q.employee_id === senderId).length} msg
                    </Typography>
                  </Box>
                  {count > 0 && (
                    <Badge badgeContent={count} color="error" />
                  )}
                </Box>
              );
            })}
          </Paper>

          {/* Conversation panel */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedSender ? (
              <Paper sx={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <Box textAlign="center">
                  <Person sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">Select an employee to view their conversation</Typography>
                </Box>
              </Paper>
            ) : (
              <Paper sx={{
                flex: 1, borderRadius: 3, overflow: 'auto', p: 3,
                border: '1px solid rgba(255,255,255,0.06)',
                backgroundColor: 'rgba(255,255,255,0.02)'
              }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 3, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Lock sx={{ fontSize: 13 }} />
                  End-to-end encrypted conversation with Employee #{selectedSender.split('_').pop().slice(0, 8)}
                </Typography>

                {selectedQueries.map((q) => (
                  <Box key={q.id} sx={{ mb: 4 }}>
                    {/* Employee message on the LEFT */}
                    <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: '#374151', fontSize: 12, flexShrink: 0, mt: 0.5 }}>
                        <Person sx={{ fontSize: 16 }} />
                      </Avatar>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">{q.subject}</Typography>
                          <Chip label={q.status === 'Answered' ? '✓ Replied' : '⏳ Pending'} size="small" color={q.status === 'Answered' ? 'success' : 'warning'} />
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                            <AccessTime sx={{ fontSize: 11 }} /> {formatTime(q.created_at)}
                          </Typography>
                        </Box>
                        <Paper sx={{ p: 1.5, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '0 10px 10px 10px', maxWidth: '80%' }}>
                          <Typography variant="body2">{q.message}</Typography>
                        </Paper>
                      </Box>
                    </Box>

                    {/* Your reply on the RIGHT */}
                    {q.response && (
                      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mb: 1 }}>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.5 }}>
                            {user.role === 'FIN' ? '💼 You (Finance)' : '👑 You (Owner)'} &nbsp;•&nbsp; {formatTime(q.updated_at)}
                          </Typography>
                          <Paper sx={{
                            p: 1.5, maxWidth: '80%', textAlign: 'left',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))',
                            borderRadius: '10px 0 10px 10px'
                          }}>
                            <Typography variant="body2">{q.response}</Typography>
                          </Paper>
                        </Box>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: '#6366f1', fontSize: 14, flexShrink: 0, mt: 0.5 }}>
                          {user.role === 'FIN' ? '💼' : '👑'}
                        </Avatar>
                      </Box>
                    )}

                    {/* Reply input */}
                    {!q.response && (
                      <Box sx={{ ml: 6, mt: 1 }}>
                        <TextField
                          size="small" fullWidth
                          placeholder="Type your reply and press Enter..."
                          value={replyText[q.id] || ''}
                          onChange={(e) => setReplyText(prev => ({ ...prev, [q.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(q.id); } }}
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <Button
                                  size="small" variant="contained"
                                  disabled={replyStatus[q.id] === 'loading' || !replyText[q.id]?.trim()}
                                  onClick={() => handleReply(q.id)}
                                  sx={{ minWidth: 'auto', px: 1.5, ml: 0.5 }}
                                >
                                  {replyStatus[q.id] === 'loading'
                                    ? <CircularProgress size={14} color="inherit" />
                                    : <ReplyIcon fontSize="small" />}
                                </Button>
                              </InputAdornment>
                            )
                          }}
                        />
                      </Box>
                    )}

                    <Divider sx={{ mt: 2.5, borderColor: 'rgba(255,255,255,0.04)' }} />
                  </Box>
                ))}
              </Paper>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Main router ──────────────────────────────────────────────────────────────
const EmployeeDashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  if (!user) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  const isManager = MANAGER_ROLES.includes(user.role);

  return (
    <Box sx={{ pb: 4 }}>
      {isManager
        ? <ManagerView user={user} apiFetch={apiFetch} />
        : <EmployeeView user={user} apiFetch={apiFetch} />
      }
    </Box>
  );
};

export default EmployeeDashboard;
