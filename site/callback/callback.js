// Shows this page's address so the user can paste it into `sleep-truth login --paste`.
const address = document.getElementById("address");
const copy = document.getElementById("copy");
const status = document.getElementById("status");
const params = new URLSearchParams(location.search);

address.value = location.href;

if (params.has("error")) {
  status.textContent = `Sign-in did not finish: ${params.get("error")}. Run sleep-truth login again.`;
} else if (!params.has("code")) {
  status.textContent = "This address has no sign-in code. Start from sleep-truth login.";
}

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(address.value);
    status.textContent = "Copied. Paste it into your terminal.";
  } catch {
    address.select();
    status.textContent = "Select the address above and copy it.";
  }
});
