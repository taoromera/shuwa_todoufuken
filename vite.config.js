import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        signup: 'signup.html',
        forgotPassword: 'forgot-password.html',
        resetPassword: 'reset-password.html',
        account: 'account.html',
        library: 'library.html',
        deck: 'deck.html',
        addCard: 'add-card.html',
      },
    },
  },
});
