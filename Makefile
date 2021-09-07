.PHONY : build image

IMAGE = obsidian-jupyter

image :
	docker build -t ${IMAGE} .

build : image
	docker run --rm ${IMAGE} bash -c "npm install && npm run build"
