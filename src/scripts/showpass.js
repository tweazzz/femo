document.querySelectorAll('.toggle-pw').forEach((button) => {
  button.addEventListener('click', () => {
    const passwordField = document.getElementById(button.dataset.target);
    passwordField.type = passwordField.type === 'password' ? 'text' : 'password';
  });
});
