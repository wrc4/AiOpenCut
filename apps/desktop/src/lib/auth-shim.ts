export type Session = {
  user: null | { id: string; name?: string; email?: string };
  expires?: string | null;
};

export const getSession = async (): Promise<Session> => {
  return { user: null, expires: null };
};

export const signIn = async (): Promise<Session> => {
  return { user: null, expires: null };
};

export const signOut = async (): Promise<void> => {
  return;
};

export default {
  getSession,
  signIn,
  signOut,
};