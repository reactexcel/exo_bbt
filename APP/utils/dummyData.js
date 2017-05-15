'use strict';

// Tour images
let images = [
	'https://www.dropbox.com/s/lv9yjkhrde8d300/1.jpg?raw=1',
	'https://www.dropbox.com/s/3l4ehkxq68k0rhq/2.jpg?raw=1',
	'https://www.dropbox.com/s/pnugzifokspqy6g/3.jpg?raw=1',
	'https://www.dropbox.com/s/trpzkc7qsp7tplm/4.jpg?raw=1',
	'https://www.dropbox.com/s/t2dfjffdr6z60za/5.jpg?raw=1',
	'https://www.dropbox.com/s/2y2jmchbpomurib/6.jpg?raw=1',
	'https://www.dropbox.com/s/pfindshnqrdj9u9/7.jpg?raw=1',
	'https://www.dropbox.com/s/kbddppabjuk4j7y/8.jpg?raw=1',
	'https://www.dropbox.com/s/wxj1qc8orrdspzz/9.jpg?raw=1',
	'https://www.dropbox.com/s/bh0mpqivh1eqe5v/10.jpg?raw=1',
	'https://www.dropbox.com/s/tug60ehum4jzdvg/11.jpg?raw=1',
	'https://www.dropbox.com/s/hskdn329uf2oa7s/12.jpg?raw=1',
	'https://www.dropbox.com/s/fpl5f0kkrfr0a9e/13.jpg?raw=1',
	'https://www.dropbox.com/s/62vo4jqxjclt7hg/14.jpg?raw=1',
	'https://www.dropbox.com/s/uf2r8yvxe5luk3d/15.jpg?raw=1',
	'https://www.dropbox.com/s/u11z8vf1aw6fgsv/16.jpg?raw=1',
	'https://www.dropbox.com/s/4lrr6s76qdba8ai/17.jpg?raw=1',
	'https://www.dropbox.com/s/dgv4re2tq1hvnob/18.jpg?raw=1',
	'https://www.dropbox.com/s/w4fahxqbvqyfl4w/19.jpg?raw=1',
	'https://www.dropbox.com/s/6zyq70kgtsl875b/20.jpg?raw=1',
	'https://www.dropbox.com/s/hq2cas4mdz7fkz8/21.jpg?raw=1',
	'https://www.dropbox.com/s/dxt81raedpex9o2/22.jpg?raw=1',
	'https://www.dropbox.com/s/h3gf2nc92h6k7qd/23.jpg?raw=1',
	'https://www.dropbox.com/s/ltugq4dk178nux0/24.jpg?raw=1',
	'https://www.dropbox.com/s/nu8v4756m5ap057/25.jpg?raw=1',
	'https://www.dropbox.com/s/rev260tswemb6o2/26.jpg?raw=1',
	'https://www.dropbox.com/s/4dg8gfqtlvjn782/27.jpg?raw=1',
	'https://www.dropbox.com/s/f0sk4ypdm9h8z4l/28.jpg?raw=1',
	'https://www.dropbox.com/s/e9d99e09ctonmuo/29.jpg?raw=1'
];

// Hotel images
let hotel_images = [
	'https://www.dropbox.com/s/bzpok6nlz8ea88o/1.jpg?raw=1',
	'https://www.dropbox.com/s/dbk1ugr9s9mb6r3/2.jpg?raw=1',
	'https://www.dropbox.com/s/pcrp6tpiu21y19f/3.jpg?raw=1',
	'https://www.dropbox.com/s/940xyilqzm2e3on/4.jpg?raw=1',
	'https://www.dropbox.com/s/10qu38z8zhky5l2/5.jpg?raw=1',
	'https://www.dropbox.com/s/uiznisdaglgjm1s/6.jpg?raw=1',
	'https://www.dropbox.com/s/3stcyw6sshqo9n4/7.jpg?raw=1',
	'https://www.dropbox.com/s/y1hzxln1krehqez/8.jpg?raw=1',
	'https://www.dropbox.com/s/oetp8pg3zqfkdyu/9.jpg?raw=1',
	'https://www.dropbox.com/s/1nck6s7flhs7t85/10.jpg?raw=1',
	'https://www.dropbox.com/s/1ur4re2wvkkshfr/11.jpg?raw=1'
];

function getRandomTourImage() {
	var imageIndex = Math.floor(Math.random() * images.length);
	return images[imageIndex];
}

function getRandomHotelImage() {
	var imageIndex = Math.floor(Math.random() * hotel_images.length);
	return hotel_images[imageIndex];
}

module.exports = {
	getRandomTourImage: getRandomTourImage,
	getRandomHotelImage: getRandomHotelImage
};
