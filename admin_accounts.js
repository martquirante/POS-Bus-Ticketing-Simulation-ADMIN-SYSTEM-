import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, remove, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyAkpVAHRYYyp6xubi6Mt9zhX9zDBRVrjVA",
    authDomain: "santranspos.firebaseapp.com",
    databaseURL: "https://santranspos-default-rtdb.firebaseio.com",
    projectId: "santranspos",
    storageBucket: "santranspos.firebasestorage.app",
    messagingSenderId: "1070508476864",
    appId: "1:1070508476864:web:5af5934ad86088617da025"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 🔐 AUTHENTICATION LOGIC (SIGNUP & LOGIN)
// ==========================================

// 1. Check if already logged in
document.addEventListener("DOMContentLoaded", () => {
    const session = localStorage.getItem("superAdminSession");
    if (session) {
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainPortal").style.display = "block";
        document.getElementById("adminNameDisplay").innerText = session;
    }
});

// 2. Switch between Login & Signup Forms
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

// 3. LOGIN FUNCTION
window.performLogin = () => {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    if (!user || !pass) return alert("Please fill all fields.");

    // Fix dots in email for Firebase key
    const safeUser = user.replace(/\./g, '_');

    get(ref(db, `SuperAdmins/${safeUser}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.password === pass) {
                localStorage.setItem("superAdminSession", data.name);
                location.reload(); 
            } else {
                alert("❌ Incorrect Password!");
            }
        } else {
            alert("❌ Account Not Found. Please Sign Up first.");
        }
    }).catch(err => alert("Error: " + err.message));
};

// 4. SIGNUP FUNCTION
window.performSignup = () => {
    const name = document.getElementById("regName").value.trim();
    const user = document.getElementById("regUser").value.trim(); // Username/Email
    const pass = document.getElementById("regPass").value.trim();
    const key = document.getElementById("regKey").value.trim();

    // 🔑 MASTER KEY: Ito ang password para makagawa ng admin. 
    // Default: 123456
    const MASTER_KEY = "123456"; 

    if (key !== MASTER_KEY) return alert("⛔ Invalid Master Key! You are not authorized.");
    if (!name || !user || !pass) return alert("Fill all fields.");

    const safeUser = user.replace(/\./g, '_');

    // Check availability
    get(ref(db, `SuperAdmins/${safeUser}`)).then((snapshot) => {
        if (snapshot.exists()) {
            alert("❌ Username/Email already taken!");
        } else {
            // Save new admin
            set(ref(db, `SuperAdmins/${safeUser}`), {
                name: name,
                password: pass,
                role: "SuperAdmin"
            }).then(() => {
                alert("✅ Admin Account Created! Please Login.");
                window.switchAuth('login');
            });
        }
    });
};

// 5. Logout
window.logout = () => {
    if(confirm("Logout from Admin Portal?")) {
        localStorage.removeItem("superAdminSession");
        location.reload();
    }
};

// ==========================================
// PENDING & ACTIVE ACCOUNTS (Logic mo dati)
// ==========================================
onValue(ref(db, 'Users/Pending'), (snapshot) => {
    const list = document.getElementById('pendingTable');
    const badge = document.getElementById('pendingCount');
    list.innerHTML = "";
    let count = 0;
    
    if (snapshot.exists()) {
        snapshot.forEach(childSnap => {
            const key = childSnap.key;
            const user = childSnap.val();
            count++;
            
            list.innerHTML += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="bg-primary-subtle text-primary rounded-circle p-2 me-3"><i class="fas fa-user"></i></div>
                            <div><strong class="text-dark">${user.fullName}</strong><br><small class="text-muted">${user.email}</small></div>
                        </div>
                    </td>
                    <td><span class="badge bg-secondary">${user.requestedRole || 'Staff'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-success me-1" onclick="window.openApproveModal('${key}', '${user.fullName}', '${user.email}')"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.rejectUser('${key}')"><i class="fas fa-times"></i></button>
                    </td>
                </tr>`;
        });
    } else {
        list.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">No pending requests.</td></tr>`;
    }
    badge.innerText = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
});

onValue(ref(db, 'Users/Active'), (snapshot) => {
    const list = document.getElementById('activeTable');
    list.innerHTML = "";
    if (snapshot.exists()) {
        snapshot.forEach(childSnap => {
            const key = childSnap.key;
            const user = childSnap.val();
            list.innerHTML += `
                <tr>
                    <td><div class="fw-bold text-dark">${user.fullName}</div><div class="small text-muted">${user.email}</div></td>
                    <td><span class="badge bg-info text-dark border border-info">${user.role}</span></td>
                    <td><span class="badge bg-success">Active</span></td>
                    <td><button class="btn btn-sm btn-light text-danger border" onclick="window.deactivateUser('${key}')"><i class="fas fa-trash-alt"></i></button></td>
                </tr>`;
        });
    } else {
        list.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No active employees yet.</td></tr>`;
    }
});

window.openApproveModal = (key, name, email) => {
    document.getElementById('approveModal').style.display = 'flex';
    document.getElementById('approveKey').value = key;
    document.getElementById('approveName').value = name;
    document.getElementById('approveEmail').value = email;
    document.getElementById('emailDisplay').innerText = email;
    window.generatePass();
};

window.generatePass = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    document.getElementById('genPassword').value = `POS-${random}`;
};

window.confirmApproval = () => {
    const key = document.getElementById('approveKey').value;
    const name = document.getElementById('approveName').value;
    const email = document.getElementById('approveEmail').value;
    const role = document.getElementById('assignRole').value;
    const password = document.getElementById('genPassword').value;

    const btn = document.querySelector("#approveModal button[type='submit']");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;
    btn.disabled = true;

    // ⚠️ UPDATE MO TO SA EMAILJS IDs MO
    const serviceID = "YOUR_SERVICE_ID";   
    const templateID = "template_z1rh0yx"; 

    const emailParams = {
        to_name: name,
        to_email: email,
        user_role: role,
        user_password: password,
        system_name: "POS Bus Ticketing Simulation"
    };

    emailjs.send(serviceID, templateID, emailParams)
        .then(() => {
            const userData = { fullName: name, email: email, role: role, password: password, dateApproved: new Date().toISOString() };
            set(ref(db, `Users/Active/${key}`), userData).then(() => {
                remove(ref(db, `Users/Pending/${key}`));
                alert(`✅ User Approved!\nCredentials sent to ${email}`);
                document.getElementById('approveModal').style.display = 'none';
                btn.innerHTML = originalText; btn.disabled = false;
            });
        })
        .catch((err) => {
            console.error(err);
            alert("❌ Email Failed! Check IDs or Quota.");
            btn.innerHTML = originalText; btn.disabled = false;
        });
};

window.rejectUser = (key) => { if(confirm("Reject?")) remove(ref(db, `Users/Pending/${key}`)); };
window.deactivateUser = (key) => { if(confirm("Remove user?")) remove(ref(db, `Users/Active/${key}`)); };