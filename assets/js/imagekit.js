// assets/js/imagekit.js

var imagekit = new ImageKit({
    publicKey : "public_1rzC7+HYArrie4/eYoI0txq05S4=",
    urlEndpoint : "https://ik.imagekit.io/fwjhcuxnq",
    authenticationEndpoint : "http://www.yourserver.com/auth",
});

// URL generation
var imageURL = imagekit.url({
    path : "/default-image.jpg",
    transformation : [{
        "height" : "300",
        "width" : "400"
    }]
});

// Upload function
function upload(data) {
    var file = document.getElementById("file1");
    imagekit.upload({
        file : file.files[0],
        fileName : "abc1.jpg",
        tags : ["tag1"]
    }, function(err, result) {
        console.log(arguments);
        console.log(imagekit.url({
            src: result.url,
            transformation : [{ height: 300, width: 400}]
        }));
    });
}
