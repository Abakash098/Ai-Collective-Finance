import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import paymentReducer from './paymentSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    payments: paymentReducer,
  },
});

export default store;
