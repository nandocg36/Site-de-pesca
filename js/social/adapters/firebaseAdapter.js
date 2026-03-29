const NOT_CONFIGURED = 'Firebase não configurado. Troque o adaptador em js/social/bootstrap.js quando o projeto estiver ligado.';

function rejectAll() {
  return Promise.reject(new Error(NOT_CONFIGURED));
}

/**
 * Placeholder para Auth + Firestore + Storage.
 * Implementar métodos espelhando {@link createMockBackend} quando for integrar.
 */
export function createFirebaseAdapter() {
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
