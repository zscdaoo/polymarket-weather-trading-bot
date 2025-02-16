const header = document.querySelector("header");

window.addEventListener("scroll", function(){
    header.classList.toggle("sticky", this.window.scrollY > 0)
});

let menu = document.querySelector('#menu-iocn');
let navigation = document.querySelector('.navigation');

menu.onclick = () => {
    menu.classList.toggle('bx-x');
    navigation.classList.toggle('open');
}

window.onscroll = () => {
    menu.classList.remove('bx-x');
    navigation.classList.remove('open');
}