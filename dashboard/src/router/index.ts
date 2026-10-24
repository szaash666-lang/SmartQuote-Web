import { createRouter, createWebHashHistory } from 'vue-router';
import MainRoutes from './MainRoutes';
import AuthRoutes from './AuthRoutes';
import ChatBoxRoutes from './ChatBoxRoutes';
import { useAuthStore } from '@/stores/auth';
import { useRouterLoadingStore } from '@/stores/routerLoading';
import { useOnboardingStore } from '@/stores/onboarding';

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    MainRoutes,
    AuthRoutes,
    ChatBoxRoutes
  ]
});

interface AuthStore {
  username: string;
  returnUrl: string | null;
  login(
    username: string,
    password: string,
    code?: string,
    trustDeviceToken?: boolean,
  ): Promise<void | 'totp_required' | 'upgrade_recovery_required'>;
  logout(): void;
  has_token(): boolean;
}

router.beforeEach(async (to, from, next) => {
  if (from.name && from.path !== to.path) {
    const loadingStore = useRouterLoadingStore();
    loadingStore.start();
  }

  const publicPages = ['/auth/login', '/auth/setup'];
  const authRequired = !publicPages.includes(to.path);
  const auth: AuthStore = useAuthStore();

  // Redirect authenticated users to the primary product entry.
  if (to.path === '/auth/login' && auth.has_token()) {
    return next('/chat');
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (authRequired && !auth.has_token()) {
      auth.returnUrl = to.fullPath;
      return next('/auth/login');
    }
    if (to.matched.some((record) => record.meta.requiresOnboarding)) {
      const onboarding = useOnboardingStore();
      if (!(await onboarding.check())) {
        return next({
          path: '/bot-config/overview',
          query: { onboarding: 'required', next: to.fullPath },
        });
      }
    }
    return next();
  } else {
    next();
  }
});

router.afterEach(() => {
  const loadingStore = useRouterLoadingStore();
  loadingStore.finish();
});
