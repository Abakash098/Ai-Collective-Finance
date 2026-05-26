import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  requests: [
    { id: '1', amount: '5000.00', currency: 'USD', purpose: 'Server Hosting Q1', status: 'PND', date: '2026-05-14T08:00:00Z' },
    { id: '2', amount: '1200.50', currency: 'USD', purpose: 'Software Licenses', status: 'DSB', date: '2026-05-10T10:30:00Z' }
  ],
  loading: false,
  error: null,
};

const paymentSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    setRequests: (state, action) => {
      state.requests = action.payload;
    },
    addRequest: (state, action) => {
      state.requests.unshift({
        ...action.payload,
        id: Math.random().toString(36).substr(2, 9),
        status: 'PND', // Starts as Pending
        date: new Date().toISOString(),
      });
    },
    updateRequestStatus: (state, action) => {
      const { id, status } = action.payload;
      const existingRequest = state.requests.find(req => req.id === id);
      if (existingRequest) {
        existingRequest.status = status;
      }
    }
  }
});

export const { setRequests, addRequest, updateRequestStatus } = paymentSlice.actions;
export default paymentSlice.reducer;
