// ==========================================================================================
// ADMIN ACCOUNTS SCRIPT
// Purpose:
// 1. Mag-handle ng login/signup para sa mga "Super Admin".
// 2. Mag-display ng listahan ng mga pending at active na user accounts.
// 3. Magbigay ng functionality para i-approve, i-reject, o i-deactivate ang mga user.
// ==========================================================================================

// Import ng mga kailangan mula sa Firebase SDK, tulad ng sa dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, remove, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE CONFIG ---
// Kailangan ulit natin i-define dito para gumana ang koneksyon sa page na ito.
const firebaseConfig = {
    apiKey: "AIzaSyAkpVAHRYYyp6xubi6Mt9zhX9zDBRVrjVA",
    authDomain: "santranspos.firebaseapp.com",
    databaseURL: "https://santranspos-default-rtdb.firebaseio.com",
    projectId: "santranspos",
    storageBucket: "santranspos.firebasestorage.app",
    messagingSenderId: "1070508476864",
    appId: "1:1070508476864:web:5af5934ad86088617da025"
};

// Simulan ang Firebase app at kunin ang database reference.
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================================================================
// 🔐 AUTHENTICATION LOGIC (Para sa Super Admin)
// ==========================================================================================

// 1. Titingnan kung naka-login na ba ang Super Admin pagka-load ng page.
document.addEventListener("DOMContentLoaded", () => {
    // Kinukuha ang session mula sa `localStorage` ng browser.
    const session = localStorage.getItem("superAdminSession");
    if (session) {
        // Kung may session, itago ang login/signup form at ipakita ang main portal.
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainPortal").style.display = "block";
        document.getElementById("adminNameDisplay").innerText = session; // Ipakita ang pangalan ng admin.
    }
});

// 2. Function para magpalit sa pagitan ng Login at Signup forms.
window.switchAuth = (type) => {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");

    if (type === 'login') {
        loginForm.style.display = "block";
        signupForm.style.display = "none";
        tabLogin.classList.add("active");
        tabSignup.classList.remove("active");
    } else {
        loginForm.style.display = "none";
        signupForm.style.display = "block";
        tabLogin.classList.remove("active");
        tabSignup.classList.add("active");
    }
};

// 3. LOGIN FUNCTION - Para sa pag-login ng Super Admin.
window.performLogin = () => {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    if (!user || !pass) return alert("Pakilagay lahat ng detalye.");

    // Inaayos ang email para maging valid na Firebase key (walang tuldok).
    const safeUser = user.replace(/\./g, '_');

    // Tinitingnan sa database kung may record ang user.
    get(ref(db, `SuperAdmins/${safeUser}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.password === pass) {
                // Kung tama ang password, i-save sa localStorage at i-reload ang page.
                localStorage.setItem("superAdminSession", data.name);
                location.reload(); 
            } else {
                alert("❌ Maling Password!");
            }
        } else {
            alert("❌ Hindi nakita ang account. Mag-sign up muna.");
        }
    }).catch(err => alert("Error: " + err.message));
};

// 4. SIGNUP FUNCTION - Para gumawa ng bagong Super Admin account.
window.performSignup = () => {
    const name = document.getElementById("regName").value.trim();
    const user = document.getElementById("regUser").value.trim(); // Username/Email
    const pass = document.getElementById("regPass").value.trim();
    const key = document.getElementById("regKey").value.trim();

    // 🔑 MASTER KEY: Ito ang sikretong password para makagawa ng bagong admin.
    // Para lang ito sa may-ari ng system.
    const MASTER_KEY = "123456"; 

    if (key !== MASTER_KEY) return alert("⛔ Maling Master Key! Hindi ka awtorisado.");
    if (!name || !user || !pass) return alert("Pakilagay lahat ng detalye.");

    const safeUser = user.replace(/\./g, '_');

    // Tinitingnan muna kung may kaparehong username/email na.
    get(ref(db, `SuperAdmins/${safeUser}`)).then((snapshot) => {
        if (snapshot.exists()) {
            alert("❌ May gumagamit na ng Username/Email na ito!");
        } else {
            // Kung wala pa, i-save ang bagong admin sa database.
            set(ref(db, `SuperAdmins/${safeUser}`), {
                name: name,
                password: pass,
                role: "SuperAdmin"
            }).then(() => {
                alert("✅ Matagumpay na nagawa ang Admin Account! Mag-login na.");
                window.switchAuth('login'); // Ilipat sa login form.
            });
        }
    });
};

// 5. Logout Function
window.logout = () => {
    if(confirm("Sigurado ka bang gusto mong mag-logout?")) {
        localStorage.removeItem("superAdminSession"); // Tatanggalin ang session.
        location.reload(); // I-rereload ang page para bumalik sa login.
    }
};


// ==========================================================================================
// 👩‍💼 USER ACCOUNT MANAGEMENT (Pending at Active)
// Kinukuha nito ang data mula sa `Users/Pending` at `Users/Active` sa Firebase.
// ==========================================================================================

// Makinig sa mga pagbabago sa `Users/Pending`.
onValue(ref(db, 'Users/Pending'), (snapshot) => {
    const list = document.getElementById('pendingTable');
    const badge = document.getElementById('pendingCount');
    list.innerHTML = "";
    let count = 0;
    
    if (snapshot.exists()) {
        snapshot.forEach(childSnap => {
            const key = childSnap.key; // Unique ID ng user
            const user = childSnap.val();
            count++;
            
            // Gumagawa ng HTML row para sa bawat pending user.
            list.innerHTML += `
                <tr>
                    <td>...</td>
                    <td>...</td>
                    <td>
                        <button onclick="window.openApproveModal('${key}', '${user.fullName}', '${user.email}')">Approve</button>
                        <button onclick="window.rejectUser('${key}')">Reject</button>
                    </td>
                </tr>`;
        });
    } else {
        list.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">Walang nakapilang request.</td></tr>`;
    }
    badge.innerText = count; // I-update ang bilang sa badge.
    badge.style.display = count > 0 ? 'inline-block' : 'none';
});

// Makinig sa mga pagbabago sa `Users/Active`.
onValue(ref(db, 'Users/Active'), (snapshot) => {
    const list = document.getElementById('activeTable');
    list.innerHTML = "";
    if (snapshot.exists()) {
        snapshot.forEach(childSnap => {
            const key = childSnap.key;
            const user = childSnap.val();

            // Gumagawa ng HTML row para sa bawat active user.
            list.innerHTML += `
                <tr>
                    <td>...</td>
                    <td>...</td>
                    <td>...</td>
                    <td>
                        <button onclick="window.deactivateUser('${key}')">Deactivate</button>
                    </td>
                </tr>`;
        });
    } else {
        list.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">Wala pang aktibong empleyado.</td></tr>`;
    }
});

// Binubuksan ang "Approve User" modal at nilalagay ang info ng user.
window.openApproveModal = (key, name, email) => {
    document.getElementById('approveModal').style.display = 'flex';
    document.getElementById('approveKey').value = key;
    document.getElementById('approveName').value = name;
    document.getElementById('approveEmail').value = email;
    document.getElementById('emailDisplay').innerText = email;
    window.generatePass(); // Gumagawa ng random password.
};

// Function para gumawa ng random na temporary password.
window.generatePass = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    document.getElementById('genPassword').value = `POS-${random}`;
};

// Function kapag kinumpirma ang pag-approve sa user.
window.confirmApproval = () => {
    const key = document.getElementById('approveKey').value;
    const name = document.getElementById('approveName').value;
    const email = document.getElementById('approveEmail').value;
    const role = document.getElementById('assignRole').value;
    const password = document.getElementById('genPassword').value;

    const btn = document.querySelector("#approveModal button[type='submit']");
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Nagpapadala...`;
    btn.disabled = true;

    // ⚠️ IMPORTANT: I-UPDATE MO TO SA SARILI MONG EMAILJS IDs
    // Kailangan mo ng EmailJS account para gumana ito.
    const serviceID = "YOUR_SERVICE_ID";   
    const templateID = "template_z1rh0yx"; // Template para sa email.

    const emailParams = { to_name: name, to_email: email, user_role: role, user_password: password };

    // I-sesend ang email gamit ang EmailJS.
    emailjs.send(serviceID, templateID, emailParams)
        .then(() => {
            // Kung successful ang pag-send ng email...
            const userData = { fullName: name, email: email, role: role, password: password, dateApproved: new Date().toISOString() };
            
            // 1. Ilipat ang user data mula `Pending` papuntang `Active`.
            set(ref(db, `Users/Active/${key}`), userData).then(() => {
                // 2. Burahin ang data mula sa `Pending`.
                remove(ref(db, `Users/Pending/${key}`));
                alert(`✅ Na-approve na ang user!\nPinadala ang credentials sa ${email}`);
                document.getElementById('approveModal').style.display = 'none';
                btn.disabled = false;
            });
        })
        .catch((err) => {
            // Kung nagka-error sa pag-send ng email.
            console.error(err);
            alert("❌ Nabigo ang pag-send ng email! Suriin ang iyong EmailJS Service/Template IDs o Quota.");
            btn.disabled = false;
        });
};

// Function para i-reject ang isang pending user.
window.rejectUser = (key) => { 
    if(confirm("Sigurado ka bang i-rereject ang user na ito?")) {
        // Buburahin lang ang record mula sa `Users/Pending`.
        remove(ref(db, `Users/Pending/${key}`)); 
    }
};

// Function para i-deactivate (burahin) ang isang active user.
window.deactivateUser = (key) => { 
    if(confirm("Sigurado ka bang tatanggalin ang user na ito?")) {
        // Buburahin ang record mula sa `Users/Active`.
        remove(ref(db, `Users/Active/${key}`)); 
    }
};
