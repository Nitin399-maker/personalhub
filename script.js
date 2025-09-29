let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let supabase = null;
const elements = {
    configSection: document.getElementById('config-section'),
    btnConnect: document.getElementById('btn-connect'),
    supabaseUrl: document.getElementById('supabase-url'),
    supabaseKey: document.getElementById('supabase-key'),
    btnSignIn: document.getElementById('btn-signin'),
    btnSignOut: document.getElementById('btn-signout'),
    userEmail: document.getElementById('user-email'),
    authHint: document.getElementById('auth-hint'),
    noteSection: document.getElementById('note-section'),
    noteForm: document.getElementById('note-form'),
    titleInput: document.getElementById('title'),
    contentInput: document.getElementById('content'),
    notesList: document.getElementById('notes-list'),
    notesEmpty: document.getElementById('notes-empty')
};
let currentUser = null;

async function init() {
    elements.btnConnect.addEventListener('click', connectToSupabase);
    elements.btnSignIn.addEventListener('click', signInWithGoogle);
    elements.btnSignOut.addEventListener('click', signOut);
    elements.noteForm.addEventListener('submit', handleNoteSubmit);
}

function connectToSupabase() {
    SUPABASE_URL = elements.supabaseUrl.value.trim();
    SUPABASE_ANON_KEY = elements.supabaseKey.value.trim();
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return alert('Please enter both Supabase URL and Anon Key.');
    }
    
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        elements.configSection.classList.add('d-none');
        elements.btnSignIn.disabled = false;
        elements.authHint.textContent = 'Please sign in to create and view your notes.';
        
        supabase.auth.onAuthStateChange((event, session) => {
            event === 'SIGNED_IN' ? handleUserSignedIn(session.user) : event === 'SIGNED_OUT' && handleUserSignedOut();
        });
        
        checkExistingSession();
    } catch (error) {
        alert('Error connecting to Supabase. Please check your credentials.');
    }
}

async function checkExistingSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) handleUserSignedIn(session.user);
    } catch (error) { handleUserSignedOut(); }
}

async function signInWithGoogle() {
    try {
        // Temporary: Log the actual redirect URI being used
        console.log('Current location:', window.location.href);
        console.log('Origin:', window.location.origin);
        console.log('Pathname:', window.location.pathname);
        
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: "https://nitin399-maker.github.io/personalhub/"
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Auth error:', error);
        alert('Error signing in. Please try again.');
    }
}

async function signOut() {
    try {
        localStorage.removeItem('sb-' + SUPABASE_URL.split('//')[1].split('.')[0] + '-auth-token');
        await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {  console.log('Sign out completed (with local cleanup)');  }
    handleUserSignedOut();
}

async function forceSignOut() {
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].forEach(key => {
        (key.includes('supabase') || key.includes('sb-')) && (localStorage.removeItem(key), sessionStorage.removeItem(key));
    });
    handleUserSignedOut();
    window.location.reload();
}

function handleUserSignedIn(user) {
    currentUser = user;
    updateUI({btnSignIn:'d-none', btnSignOut: '',userEmail: '', authHint: 'd-none',noteSection: ''});
    elements.userEmail.textContent = user.email;
    loadNotes();
}

function handleUserSignedOut() {
    currentUser = null;
    updateUI({btnSignIn: '',  btnSignOut: 'd-none',  userEmail: 'd-none',
              authHint: '',noteSection: 'd-none'});
    elements.notesList.innerHTML = '';
    elements.titleInput.value = elements.contentInput.value = '';
}

function updateUI(classes) {
    Object.entries(classes).forEach(([element, className]) => {
        elements[element].className = elements[element].className.replace(/d-none/g, '').trim() + (className ? `${className}` : '');
    });
}

async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = elements.titleInput.value.trim();
    const content = elements.contentInput.value.trim();
    if (!currentUser) return alert('Please sign in to create notes.');
    try {
        const { error } = await supabase.from('notes').insert([{
            user_id: currentUser.id,
            title: title || null,
            content: content
        }]);
        if (error) {
            if (error.message.includes('JWT') || error.message.includes('auth')) {
                alert('Session expired. Please sign in again.');
                return handleUserSignedOut();
            }
            throw error;
        }
        elements.titleInput.value = elements.contentInput.value = '';
        loadNotes();
    } catch (error) {
        console.error('Error creating note:', error);
        alert('Error creating note. Please try again.');
    }
}

async function loadNotes() {
    if (!currentUser) return;
    try {
        const { data} = await supabase.from('notes').select('*').order('created_at', { ascending: false });
        displayNotes(data);
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

function displayNotes(notes) {
    if (!notes?.length) {
        elements.notesList.innerHTML = '';
        return elements.notesEmpty.classList.remove('d-none');
    }
    elements.notesEmpty.classList.add('d-none');
    elements.notesList.innerHTML = notes.map(note => `
        <div class="col-12 col-md-6 col-lg-4">
            <div class="card h-100">
                <div class="card-body">
                    ${note.title ? `<h5 class="card-title">${escapeHtml(note.title)}</h5>` : ''}
                    <p class="card-text">${escapeHtml(note.content)}</p>
                    <small class="text-muted">
                        ${new Date(note.created_at).toLocaleDateString()}
                        ${new Date(note.created_at).toLocaleTimeString()}
                    </small>
                </div>
                <div class="card-footer">
                    <button class="btn btn-sm btn-outline-primary" onclick="editNote('${note.id}')">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteNote('${note.id}')">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function editNote(noteId) {
    if (!currentUser) return alert('Please sign in to edit notes.');
    try {
        const { data, error } = await supabase.from('notes').select('*').eq('id', noteId).single();
        if (error) throw error;
        elements.titleInput.value = data.title || '';
        elements.contentInput.value = data.content || '';
        await deleteNote(noteId, false);
        elements.noteForm.scrollIntoView({ behavior: 'smooth' });
        elements.titleInput.focus();
    } catch (error) {
        console.error('Error editing note:', error);
        alert('Error editing note. Please try again.');
    }
}

async function deleteNote(noteId, confirm = true) {
    if (!currentUser) return alert('Please sign in to delete notes.');
    try {
        const { error } = await supabase.from('notes').delete().eq('id', noteId);
        if (error) throw error;
        loadNotes();
    } catch (error) {
        console.error('Error deleting note:', error);
        if (confirm) alert('Error deleting note. Please try again.');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);