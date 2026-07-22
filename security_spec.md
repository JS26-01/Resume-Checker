# Firebase Security Specification & TDD Plan

This specification outlines the data invariants, "Dirty Dozen" attack payloads, and the testing architecture for securing student interview preparation profiles and session data in the Brit Interview Coach platform.

## 1. Data Invariants

1. **User Ownership Boundaries**: No student may ever read, write, or query another student's account record (`/users/{userId}`) or their associated sessions subcollection `/users/{userId}/sessions/{sessionId}`.
2. **Identity Integrity**: During user profile registration or update, the user account's document ID and internal metadata must strictly match the authenticated user's ID (`request.auth.uid`). No spoofed ownership is allowed.
3. **Temporal Invariants**: All critical timestamp fields such as user creation must match the server-generated `request.time`. Client-supplied past or future values must be rejected.
4. **Action-State Constraints**: A completed interview session (`isCompleted == true`) locked with a `finalReport` cannot be reverted back to active progress, nor can its answers or scores be edited.
5. **No Universal Lists**: Evaluators or administrators do not exist on the client-side applet, meaning all global reads, listings, or scans of the `/users` or `/users/{userId}/sessions` database paths are completely prohibited. Every list operation must be scoped to standard student-specific queries.
6. **Denial of Wallet Limits**: Strings, arrays, and keys are heavily bounded by character lengths, set size limits, or presence constraints to block payload injection attacks that cause resource exhaustion.

---

## 2. The "Dirty Dozen" Vulnerabilities & Malicious Payloads

The following 12 JSON vectors target the integrity boundaries:

### Vulnerability Group A: Identity Spoofing & RBAC Escalation
1. **Payload 1: Profile Cross-Write (Identity Hijack)**  
   *Target Path*: `/users/attacker_uid`  
   *Attacker*: Auth UID `victim_uid`  
   *Goal*: Modifying another student's account metadata.  
   *Expectation*: `PERMISSION_DENIED`.

2. **Payload 2: Profile Self-Promotion to Admin**  
   *Target Path*: `/users/auth_uid`  
   *Payload*: `{ "name": "Samuel", "email": "sam@albion.edu", "createdAt": "2026-06-10T00:00:00Z", "role": "admin", "isAdmin": true }`  
   *Goal*: Escalate access role with client claims.  
   *Expectation*: `PERMISSION_DENIED` (Strict schema block or validation limits).

3. **Payload 3: Subcollection Insertion Spoofing**  
   *Target Path*: `/users/victim_uid/sessions/session_new_123`  
   *Payload*: `{ "id": "session_new_123", "date": "Jun 10", "userId": "victim_uid", "currentQuestionIndex": 0, "isCompleted": false, "jobTarget": { ... } }`  
   *Attacker*: Auth UID `attacker_uid`  
   *Goal*: Inject sessions into another student's progress logs.  
   *Expectation*: `PERMISSION_DENIED`.

### Vulnerability Group B: Boundary Poisoning & Denial of Wallet
4. **Payload 4: Field Blowout (1MB String Attack)**  
   *Target Path*: `/users/auth_uid`  
   *Payload*: `{ "email": "sam@albion.edu", "name": "A[...1,000,000 characters...]A", "createdAt": "request.time" }`  
   *Goal*: Exceed database parsing throughput memory limits.  
   *Expectation*: `PERMISSION_DENIED` (Name field length cap).

5. **Payload 5: ID Character Poisoning (Special characters injection)**  
   *Target Path*: `/users/auth_uid/sessions/$$$_PoIsOnId_$$$`  
   *Goal*: Break path indexes or inject malicious key characters.  
   *Expectation*: `PERMISSION_DENIED` (Strict ID regex matching).

6. **Payload 6: Array Size Exhaustion**  
   *Target Path*: `/users/auth_uid`  
   *Payload*: `{ "savedResume": { "name": "Sam", "education": "Albion", "majorMinor": "CS", "skills": ["skill", ..., 500 skills] } }`  
   *Goal*: Bloat document size representation.  
   *Expectation*: `PERMISSION_DENIED` (Array size constraints).

### Vulnerability Group C: State Violation & Temporal Hijack
7. **Payload 7: Post-Completed State Rewriting (Terminal State Lock)**  
   *Target Path*: `/users/auth_uid/sessions/completed_session_123`  
   *Existing Document*: `isCompleted = true` with overallScore = 85.  
   *Attempted Update*: `{ "currentQuestionIndex": 1, "isCompleted": false }`  
   *Goal*: Unlock finished interview evaluation logs.  
   *Expectation*: `PERMISSION_DENIED` (Terminal lock verification).

8. **Payload 8: Retroactive Clock Fabrication**  
   *Target Path*: `/users/auth_uid`  
   *Payload*: `{ "email": "sam@albion.edu", "name": "Sam", "createdAt": "1999-12-31T23:59:59Z" }`  
   *Goal*: Mock historic credentials timestamp validation.  
   *Expectation*: `PERMISSION_DENIED` (Enforce `request.time` rules).

9. **Payload 9: Immutability Tampering (OwnerID Switchout)**  
   *Target Path*: `/users/auth_uid/sessions/active_sess_44`  
   *Attempted Update*: `{ "userId": "some_other_id_attacker" }`  
   *Current Doc*: `{ "userId": "auth_uid" }`  
   *Goal*: Pivot ownership reference field of sub-items.  
   *Expectation*: `PERMISSION_DENIED`.

### Vulnerability Group D: Unsecure Listing & Orphan Writes
10. **Payload 10: Parentless Record Creation (Orphan Record)**  
    *Target Path*: `/users/non_existent_uid/sessions/session_71`  
    *Goal*: Create documents under paths with missing parent objects.  
    *Expectation*: `PERMISSION_DENIED` (Exists check on parent collection).

11. **Payload 11: Blanket Data Scrape (Scraping list queries)**  
    *Target Path*: Collection group or `/users` List query without filter.  
    *Goal*: Scraping profiles of all registered student accounts.  
    *Expectation*: `PERMISSION_DENIED` (Enforced `resource.data.userId == request.auth.uid` rules).

12. **Payload 12: Invalid Evaluation Scores Manipulation**  
    *Target Path*: `/users/auth_uid/sessions/sess_90`  
    *Payload Update*: `{ "feedbacks": { "q1": { "score": 9999 } } }`  
    *Goal*: Inject invalid out-of-bounds metrics fields into feedback object of completed questions.  
    *Expectation*: `PERMISSION_DENIED` (Granular inner score schema boundary [1-10] rules).

---

## 3. The Test Runner

The standard, local testing framework uses the `@firebase/rules-unit-testing` standard interface to validate this specification suite.

```ts
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

describe('Brit Interview Coach - Zero Trust Security Rules Suite', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'iconic-cooler-b6tp2',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8'),
      }
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('Payload 1: Blocks profile cross-writes on /users/{userId}', async () => {
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(unauthenticatedDb, 'users/student_1'), { name: 'Brutus' }));

    const victimDb = testEnv.authenticatedContext('victim_uid', { email: 'victim@albion.edu', email_verified: true }).firestore();
    const attackerDb = testEnv.authenticatedContext('attacker_uid', { email: 'attacker@albion.edu', email_verified: true }).firestore();

    // Create victim profile
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/victim_uid'), { email: 'victim@albion.edu', name: 'Victim Student' });
    });

    // Attacker tries to rewrite victim profile
    await assertFails(setDoc(doc(attackerDb, 'users/victim_uid'), { name: 'Hacked name' }));
  });

  it('Payload 2: Blocks self-promoting roles or admins flags inside UserAccount', async () => {
    const db = testEnv.authenticatedContext('student_1', { email: 'student@albion.edu', email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'users/student_1'), {
      email: 'student@albion.edu',
      name: 'Sam',
      role: 'admin',
      isAdmin: true,
      createdAt: '2026-06-10T18:00:00Z'
    }));
  });

  it('Payload 7: Rejects rewriting answers or status of completed sessions', async () => {
    const studentDb = testEnv.authenticatedContext('student_1', { email: 'b@albion.edu', email_verified: true }).firestore();
    
    // Seed database with a completed session
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/student_1/sessions/session_abc'), {
        id: 'session_abc',
        date: 'Jun 10',
        userId: 'student_1',
        currentQuestionIndex: 5,
        isCompleted: true,
        jobTarget: { positionTitle: 'Tutor', companyName: 'Albion', industry: 'Edu', interviewType: 'general', difficulty: 'standard' }
      });
    });

    // Attempt to reset to non-completed or regress questions index
    await assertFails(updateDoc(doc(studentDb, 'users/student_1/sessions/session_abc'), {
      isCompleted: false,
      currentQuestionIndex: 2
    }));
  });
});
```
