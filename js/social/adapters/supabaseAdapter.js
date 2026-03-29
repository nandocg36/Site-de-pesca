const NOT_CONFIGURED = 'Supabase não configurado. Troque o adaptador em js/social/bootstrap.js quando o projeto estiver ligado.';

function rejectAll() {
  return Promise.reject(new Error(NOT_CONFIGURED));
}

/**
 * Placeholder para Auth + Postgres + Storage.
 * Implementar métodos espelhando {@link createMockBackend} quando for integrar.
 */
export function createSupabaseAdapter() {
  return {
    getSession: rejectAll,
    signIn: rejectAll,
    signOut: rejectAll,
    updateProfile: rejectAll,
    createPost: rejectAll,
    listFeed: rejectAll,
    listComments: rejectAll,
    addComment: rejectAll,
    requestFriendByEmail: rejectAll,
    listFriends: rejectAll,
    submitSurvey: rejectAll,
    getAggregatesToday: rejectAll,
  };
}
